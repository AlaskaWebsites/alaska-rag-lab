import { pool } from '../database/db.js';
import { OllamaService } from '../ollama/ollama.service.js';
import { RagResponseSchema, type RagResponse } from './rag.schema.js';

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
}

export class RagService {
  private readonly ollama = new OllamaService();

  /**
   * Executa o pipeline completo:
   * 1. Vetorização da pergunta (nomic-embed-text)
   * 2. Busca por similaridade no pgvector (distância de cosseno <=>)
   * 3. Filtro cirúrgico de contexto (top 3) para mitigar Lost in the Middle
   * 4. Geração controlada no Ollama com Structured Output (JSON)
   * 5. Validação estrita via schema Zod com Fail-Fast e flag INSUFFICIENT_DATA
   */
  async ask(question: string, options: RagQueryOptions = {}): Promise<RagResponse> {
    const topK = options.topK ?? 3;
    const minSimilarity = options.minSimilarity ?? 0.40;

    // 1. Vetorização em tempo real da pergunta
    const queryEmbedding = await this.ollama.generateEmbedding(question);

    // 2. Busca Vetorial no pgvector
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

    const retrievedChunks: RetrievedChunk[] = dbResult.rows.map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      documentTitle: row.doc_title,
      content: row.content,
      similarity: parseFloat(row.similaridade),
      distance: parseFloat(row.distancia_cosseno),
    }));

    // Filtra chunks que atingem a nota mínima de relevância
    const approvedChunks = retrievedChunks.filter(
      (c) => c.similarity >= minSimilarity
    );

    // 3. Verificação precoce de insuficiência (Fail-Fast pré-LLM)
    if (approvedChunks.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        answer:
          'Não foram encontradas informações ou evidências relevantes na base de conhecimento para responder a esta pergunta.',
        confidence: 'NONE',
        sources: [],
      };
    }

    // 4. Montagem cirúrgica do prompt (apenas evidências aprovadas)
    const contextFormatted = approvedChunks
      .map(
        (c, idx) =>
          `[Fonte #${idx + 1} | Documento: "${c.documentTitle}" | Chunk: ${c.chunkIndex} | Relevância: ${(c.similarity * 100).toFixed(1)}%]\n${c.content.trim()}`
      )
      .join('\n\n---\n\n');

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

    // 5. Chamada ao modelo LLM com formato JSON forçado
    const rawOutput = await this.ollama.generateChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 6. Validação e Sanitização Fail-Fast com Zod
    try {
      const parsedJson = JSON.parse(rawOutput);
      const validated = RagResponseSchema.parse(parsedJson);
      return validated;
    } catch (validationError) {
      // Se a LLM retornar JSON quebrado ou campos fora do contrato,
      // rejeitamos a resposta (fail-fast) em vez de vazar alucinações para a UI
      console.warn(
        '[RAG Fail-Fast] LLM violou o schema estrito do Zod. Ativando fallback seguro.',
        validationError
      );

      return {
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
  }
}
