import { Injectable, Inject, Optional } from '@nestjs/common';
import { pool } from '../../../core/database/db.js';
import { OllamaService } from '../../ai-engine/providers/ollama.service.js';
import { RagResponseSchema, type RagResponse } from '../schemas/rag.schema.js';
import {
  reciprocalRankFusion,
  buildLexicalQuery,
  type ScoredCandidate,
  type FusedCandidate,
} from '../domain/rrf.js';

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
    const isDebug = options.debug ?? false;
    const lexicalQuery = buildLexicalQuery(question);

    console.log(`\n${'='.repeat(75)}`);
    console.log(`🔬 [RAG NÍVEL 2 - BUSCA HÍBRIDA + RRF ATIVADA]`);
    console.log(`❓ Pergunta: "${question}"`);

    // 1. Vetorização em tempo real da pergunta (Ollama nomic-embed-text)
    const startVec = performance.now();
    const queryEmbedding = await this.ollama.generateEmbedding(question);
    const vectorizationMs = Math.round(performance.now() - startVec);
    console.log(`⚡ [1. Vetorização]: ${vectorizationMs}ms (Vetor de 768 dimensões gerado)`);

    // 2. Busca Híbrida Paralela no PostgreSQL (Dense com HNSW + Sparse com GIN)
    const startDb = performance.now();

    const vectorQuery = `
      SELECT 
        c.id,
        c.chunk_index,
        d.title AS doc_title,
        c.content,
        ROUND((1 - (c.embedding <=> $1::vector))::numeric, 4) AS similaridade
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      ORDER BY c.embedding <=> $1::vector ASC
      LIMIT $2;
    `;

    const ftsQuery = `
      SELECT 
        c.id,
        c.chunk_index,
        d.title AS doc_title,
        c.content,
        ROUND(ts_rank_cd(c.tsv, websearch_to_tsquery('portuguese', $1))::numeric, 4) AS text_score
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.tsv @@ websearch_to_tsquery('portuguese', $1)
      ORDER BY text_score DESC
      LIMIT $2;
    `;

    const [vecResult, ftsResult] = await Promise.all([
      pool.query(vectorQuery, [JSON.stringify(queryEmbedding), topK * 2]),
      pool.query(ftsQuery, [lexicalQuery, topK * 2]),
    ]);

    const vectorSearchMs = Math.round(performance.now() - startDb);
    console.log(
      `📊 [2. Busca Híbrida]: ${vectorSearchMs}ms (Dense: ${vecResult.rows.length} chunks | Sparse FTS: ${ftsResult.rows.length} chunks)`
    );

    // 3. Fusão com Reciprocal Rank Fusion (RRF)
    const vectorCandidates: ScoredCandidate[] = vecResult.rows.map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      documentTitle: row.doc_title,
      content: row.content,
      vectorSimilarity: parseFloat(row.similaridade),
    }));

    const textCandidates: ScoredCandidate[] = ftsResult.rows.map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      documentTitle: row.doc_title,
      content: row.content,
      textScore: parseFloat(row.text_score),
    }));

    const fusedCandidates: FusedCandidate[] = reciprocalRankFusion(
      [
        { origin: 'vector', items: vectorCandidates },
        { origin: 'fulltext', items: textCandidates },
      ],
      60
    );

    console.log(`🔀 [3. Fusão RRF]: ${fusedCandidates.length} candidatos únicos combinados`);
    fusedCandidates.slice(0, topK).forEach((c, idx) => {
      console.log(
        `   └─ #${idx + 1} | Chunk [${c.chunkIndex}] | RRF: ${c.rrfScore} | Origens: [${c.matchOrigins.join(', ')}]`
      );
    });

    const approvedChunks = fusedCandidates.slice(0, topK);

    // 4. Verificação Fail-Fast Pré-LLM
    if (approvedChunks.length === 0) {
      const totalMs = Math.round(performance.now() - totalStart);
      console.log(`🛑 [Fail-Fast]: Nenhum chunk recuperado. Abortando chamada da LLM.`);
      console.log(`${'='.repeat(75)}\n`);

      return {
        status: 'INSUFFICIENT_DATA',
        answer: 'Não foram encontradas informações relevantes para responder à pergunta.',
        confidence: 'NONE',
        sources: [],
      };
    }

    // 5. Montagem Cirúrgica do Prompt
    const contextFormatted = approvedChunks
      .map(
        (c, idx) =>
          `[Fonte #${idx + 1} | Documento: "${c.documentTitle}" | Chunk: ${c.chunkIndex} | Origem: ${c.matchOrigins.join('+')}]\n${c.content.trim()}`
      )
      .join('\n\n---\n\n');

    const promptTokensEstimated = Math.round(contextFormatted.length / 4);

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

    // 6. Chamada à LLM (Ollama llama3)
    console.log(`🤖 [4. Inferência LLM]: Disparando prompt para o Ollama (llama3)...`);
    const startLlm = performance.now();
    const rawOutput = await this.ollama.generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const llmGenerationMs = Math.round(performance.now() - startLlm);
    console.log(`   └─ LLM respondeu em ${llmGenerationMs}ms (${(llmGenerationMs / 1000).toFixed(2)}s)`);

    // 7. Validação Fail-Fast com Zod
    const startVal = performance.now();
    let validatedResponse: RagResponse;

    try {
      const parsedJson = JSON.parse(rawOutput);
      const validated = RagResponseSchema.parse(parsedJson);
      const validationMs = Math.round(performance.now() - startVal);
      console.log(`🛡️ [5. Zod Validation]: ${validationMs}ms (Status: ${validated.status})`);
      validatedResponse = validated;
    } catch (validationError) {
      console.warn(`⚠️ [Zod Fail-Fast]: LLM gerou payload inválido. Ativando fallback.`);
      validatedResponse = {
        status: 'INSUFFICIENT_DATA',
        answer: 'A resposta gerada violou o contrato de validação estrito.',
        confidence: 'NONE',
        sources: approvedChunks.map((c) => ({
          documentTitle: c.documentTitle,
          chunkIndex: c.chunkIndex,
          relevanceScore: c.rrfScore,
        })),
      };
    }

    const totalMs = Math.round(performance.now() - totalStart);
    console.log(`⏱️ [TEMPO TOTAL]: ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)`);
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
