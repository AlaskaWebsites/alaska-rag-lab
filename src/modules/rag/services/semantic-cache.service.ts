import { Injectable } from '@nestjs/common';
import { redis } from '../../../core/database/redis.js';
import type { RagResponse } from '../schemas/rag.schema.js';

export interface CachedEntry {
  id: string;
  question: string;
  embedding: number[];
  response: RagResponse;
  createdAt: number;
}

export interface CacheMatch {
  cachedQuestion: string;
  similarity: number;
  response: RagResponse;
}

/**
 * Calcula a similaridade de cosseno pura entre dois vetores de mesma dimensão.
 * Fórmula: (A . B) / (||A|| * ||B||)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

@Injectable()
export class SemanticCacheService {
  private readonly PREFIX = 'semantic_cache:';
  private readonly INDEX_KEY = 'semantic_cache_keys';

  /**
   * Busca no Redis uma resposta previamente gerada para uma pergunta
   * com similaridade semântica de cosseno >= threshold (padrão 0.92 / 92%).
   */
  async findSimilar(
    queryEmbedding: number[],
    threshold: number = 0.92
  ): Promise<CacheMatch | null> {
    try {
      const keys = await redis.smembers(this.INDEX_KEY);
      if (!keys || keys.length === 0) return null;

      let bestMatch: CacheMatch | null = null;
      let maxSim = -1;

      // Executa a leitura em pipeline para latência mínima de I/O
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      const results = await pipeline.exec();
      if (!results) return null;

      for (const [err, raw] of results) {
        if (err || !raw || typeof raw !== 'string') continue;

        try {
          const entry = JSON.parse(raw) as CachedEntry;
          const sim = cosineSimilarity(queryEmbedding, entry.embedding);

          if (sim >= threshold && sim > maxSim) {
            maxSim = sim;
            bestMatch = {
              cachedQuestion: entry.question,
              similarity: Math.round(sim * 10000) / 10000,
              response: entry.response,
            };
          }
        } catch {
          // Ignora entradas eventualmente malformadas
        }
      }

      return bestMatch;
    } catch (error) {
      console.warn('[SemanticCache] Falha ao consultar cache no Redis:', error);
      return null; // Fallback defensivo: falha no cache não interrompe o RAG
    }
  }

  /**
   * Salva a pergunta, seu vetor e a resposta gerada com TTL no Redis.
   * Só grava se a resposta foi bem-sucedida (status SUCCESS).
   */
  async save(
    question: string,
    embedding: number[],
    response: RagResponse,
    ttlSeconds: number = 3600
  ): Promise<void> {
    if (response.status !== 'SUCCESS') return;

    try {
      const id = Buffer.from(question.trim().toLowerCase()).toString('base64url').slice(0, 32);
      const key = `${this.PREFIX}${id}`;

      const entry: CachedEntry = {
        id,
        question,
        embedding,
        response,
        createdAt: Date.now(),
      };

      const multi = redis.multi();
      multi.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
      multi.sadd(this.INDEX_KEY, key);
      await multi.exec();
    } catch (error) {
      console.warn('[SemanticCache] Falha ao salvar no Redis:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await redis.smembers(this.INDEX_KEY);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del(this.INDEX_KEY);
    } catch (error) {
      console.warn('[SemanticCache] Falha ao limpar cache:', error);
    }
  }
}
