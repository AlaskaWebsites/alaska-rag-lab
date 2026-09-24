import { Injectable, Inject, Optional } from '@nestjs/common';
import { pool } from '../../../core/database/db.js';
import { OllamaService } from '../../ai-engine/providers/ollama.service.js';
import { RagResponseSchema, type RagResponse } from '../schemas/rag.schema.js';

export interface RetrievedChunk {
  id: string;
  chunkIndex: number;
  documentTitle: string;
  content: string;
  similarity: number;
  distance: number;
}

export interface RagQueryOptions {
  topK?: number;
  minSimilarity?: number;
  debug?: boolean;
}

@Injectable()
export class RagService {
  private readonly ollama: OllamaService;

  constructor(@Optional() @Inject(OllamaService) ollamaService?: OllamaService) {
    this.ollama = ollamaService ?? new OllamaService();
  }

  async ask(question: string, options: RagQueryOptions = {}): Promise<RagResponse> {
    const totalStart = performance.now();
    const topK = options.topK ?? 3;
    const minSimilarity = options.minSimilarity ?? 0.40;
    const isDebug = options.debug ?? false;

    console.log(`\n${'='.repeat(75)}`);
    console.log(`🔬 [VISÃO BIÔNICA - PIPELINE RAG INICIADO]`);
    console.log(`❓ Pergunta: "${question}"`);

    // 1. Vetorização em tempo real da pergunta
    const startVec = performance.now();
    const queryEmbedding = await this.ollama.generateEmbedding(question);
    const vectorizationMs = Math.round(performance.now() - startVec);
    console.log(`⚡ [Etapa 1: Vetorização]: ${vectorizationMs}ms (Vetor de 768 dimensões gerado no Ollama)`);

    // 2. Busca Vetorial no pgvector
    const startSearch = performance.now();
    const query = `
      SELECT 
        c.id,
        c.chunk_index,
        d.title AS doc_title,
        c.content,
        ROUND((1 - (c.embedding <=> $1::vector))::numeric, 4) AS similaridade,
        ROUND((c.embedding <=> $1::vector)::numeric, 4) AS distancia_cosseno
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector ASC
      LIMIT $2;
    `;

    const dbResult = await pool.query(query, [
      JSON.stringify(queryEmbedding),
      topK,
    ]);
    const vectorSearchMs = Math.round(performance.now() - startSearch);
    console.log(`📊 [Etapa 2: pgvector HNSW]: ${vectorSearchMs}ms (Busca por distância de cosseno <=>)`);

    const retrievedChunks: RetrievedChunk[] = dbResult.rows.map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      documentTitle: row.doc_title,
      content: row.content,
      similarity: parseFloat(row.similaridade),
      distance: parseFloat(row.distancia_cosseno),
    }));

    retrievedChunks.forEach((c, i) => {
      console.log(
        `   └─ Candidato #${i + 1}: Chunk [${c.chunkIndex}] | Similaridade: ${(c.similarity * 100).toFixed(1)}% (Distância: ${c.distance})`
      );
    });

    const approvedChunks = retrievedChunks.filter(
      (c) => c.similarity >= minSimilarity
    );

    if (approvedChunks.length === 0) {
      const totalMs = Math.round(performance.now() - totalStart);
      console.log(`🛑 [Etapa 3: Fail-Fast Pré-LLM]: Nenhum chunk atingiu similaridade mínima (>= ${minSimilarity}). Abortando chamada da LLM.`);
      console.log(`${'='.repeat(75)}\n`);

      return {
        status: 'INSUFFICIENT_DATA',
        answer:
          'Não foram encontradas informações ou evidências relevantes na base de conhecimento para responder a esta pergunta.',
        confidence: 'NONE',
        sources: [],
        ...(isDebug && {
          debug: {
            latencies: {
              vectorizationMs,
              vectorSearchMs,
              llmGenerationMs: 0,
              validationMs: 0,
              totalMs,
            },
            candidatesFound: 0,
            promptTokensEstimated: 0,
          },
        }),
      };
    }

    const contextFormatted = approvedChunks
      .map(
        (c, idx) =>
          `[Fonte #${idx + 1} | Documento: "${c.documentTitle}" | Chunk: ${c.chunkIndex} | Relevância: ${(c.similarity * 100).toFixed(1)}%]\n${c.content.trim()}`
      )
      .join('\n\n---\n\n');

    const promptTokensEstimated = Math.round(contextFormatted.length / 4);
    console.log(
      `🎯 [Etapa 3: Redução de Ruído]: ${approvedChunks.length} chunks aprovados (~${promptTokensEstimated} tokens de contexto injetados)`
    );

    const systemPrompt = `Você é um assistente técnico de IA estritamente factual operando sobre uma base de conhecimento privada.
Sua missão é responder à pergunta do usuário utilizando EXCLUSIVAMENTE as fontes fornecidas no contexto.

REGRAS RÍGIDAS DE GERAÇÃO:
1. Responda APENAS com base nos fatos contidos no contexto fornecido. Não invente, não extrapole e não use conhecimento externo.
2. Se o contexto contiver as informações necessárias, defina "status": "SUCCESS" e "confidence": "HIGH" ou "MEDIUM".
3. Se o contexto NÃO contiver informações suficientes para responder com certeza absoluta, defina "status": "INSUFFICIENT_DATA", "confidence": "NONE", e explique claramente no campo "answer" o que está faltando.
4. Sua resposta deve ser OBRIGATORIAMENTE um objeto JSON válido que siga o seguinte formato:
{
  "status": "SUCCESS" | "INSUFFICIENT_DATA",
  "answer": "string",
  "confidence": "HIGH" | "MEDIUM" | "LOW" | "NONE",
  "sources": [
    {
      "documentTitle": "string",
      "chunkIndex": number,
      "relevanceScore": number
    }
  ]
}`;

    const userPrompt = `Contexto Disponível:\n${contextFormatted}\n\nPergunta do Usuário:\n${question}`;

    console.log(`🤖 [Etapa 4: Inferência LLM]: Disparando prompt cirúrgico para o Ollama (llama3)...`);
    const startLlm = performance.now();
    const rawOutput = await this.ollama.generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const llmGenerationMs = Math.round(performance.now() - startLlm);
    console.log(`   └─ Ollama respondeu em ${llmGenerationMs}ms (${(llmGenerationMs / 1000).toFixed(2)}s)`);

    const startVal = performance.now();
    let validatedResponse: RagResponse;

    try {
      const parsedJson = JSON.parse(rawOutput);
      const validated = RagResponseSchema.parse(parsedJson);
      const validationMs = Math.round(performance.now() - startVal);
      console.log(`🛡️ [Etapa 5: Zod Validation]: ${validationMs}ms (Contrato 100% válido, status: ${validated.status})`);

      validatedResponse = validated;
    } catch (validationError) {
      const validationMs = Math.round(performance.now() - startVal);
      console.warn(
        `⚠️ [Etapa 5: Zod Fail-Fast]: LLM gerou payload inválido (${validationMs}ms). Ativando fallback de segurança.`,
        validationError
      );

      validatedResponse = {
        status: 'INSUFFICIENT_DATA',
        answer:
          'A resposta gerada violou o contrato de validação estrito ou continha inconsistências.',
        confidence: 'NONE',
        sources: approvedChunks.map((c) => ({
          documentTitle: c.documentTitle,
          chunkIndex: c.chunkIndex,
          relevanceScore: c.similarity,
        })),
      };
    }

    const totalMs = Math.round(performance.now() - totalStart);
    console.log(`⏱️ [TEMPO TOTAL DO PIPELINE]: ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)`);
    console.log(`${'='.repeat(75)}\n`);

    if (isDebug) {
      validatedResponse.debug = {
        latencies: {
          vectorizationMs,
          vectorSearchMs,
          llmGenerationMs,
          validationMs: Math.round(performance.now() - startVal),
          totalMs,
        },
        candidatesFound: approvedChunks.length,
        promptTokensEstimated,
      };
    }

    return validatedResponse;
  }
}
