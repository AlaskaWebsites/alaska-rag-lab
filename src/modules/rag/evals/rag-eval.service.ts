import type { RagResponse } from '../schemas/rag.schema.js';

export interface GoldenItem {
  id: string;
  question: string;
  expectedKeywords: string[];
  expectedChunkIndex: number | null;
  expectedStatus: 'SUCCESS' | 'INSUFFICIENT_DATA';
}

export interface EvalResult {
  id: string;
  question: string;
  status: 'SUCCESS' | 'INSUFFICIENT_DATA';
  statusMatch: boolean;
  hitRateMatch: boolean;
  keywordCoverage: number; // 0.0 a 1.0
  latencyMs: number;
  cacheHit?: boolean;
}

export interface EvalReport {
  totalEvaluated: number;
  hitRate: number; // Porcentagem de acerto do chunk esperado
  failFastAccuracy: number; // Porcentagem de acerto na rejeição de dados faltantes
  avgKeywordCoverage: number; // Fidelidade semântica média
  avgLatencyMs: number;
  p95LatencyMs: number;
  results: EvalResult[];
}

/**
 * Avalia uma resposta gerada contra um item do Golden Dataset.
 */
export function evaluateResponse(
  item: GoldenItem,
  response: RagResponse,
  latencyMs: number,
  cacheHit?: boolean
): EvalResult {
  const statusMatch = response.status === item.expectedStatus;

  // Hit Rate: verifica se o chunk esperado apareceu nas fontes citadas
  let hitRateMatch = false;
  if (item.expectedChunkIndex !== null) {
    hitRateMatch = response.sources.some((s) => s.chunkIndex === item.expectedChunkIndex);
  } else {
    // Para perguntas negativas, hit rate é válido se não citou fontes falsas
    hitRateMatch = response.status === 'INSUFFICIENT_DATA';
  }

  // Keyword Coverage: verifica fidelidade das palavras-chave obrigatórias
  let keywordCoverage = 1.0;
  if (item.expectedKeywords.length > 0) {
    const answerNormalized = response.answer.toLowerCase();
    const matched = item.expectedKeywords.filter((kw) =>
      answerNormalized.includes(kw.toLowerCase())
    );
    keywordCoverage = matched.length / item.expectedKeywords.length;
  }

  return {
    id: item.id,
    question: item.question,
    status: response.status,
    statusMatch,
    hitRateMatch,
    keywordCoverage,
    latencyMs,
    cacheHit,
  };
}

/**
 * Calcula o relatório consolidado de métricas da suíte de avaliação.
 */
export function generateEvalReport(results: EvalResult[]): EvalReport {
  if (results.length === 0) {
    return {
      totalEvaluated: 0,
      hitRate: 0,
      failFastAccuracy: 0,
      avgKeywordCoverage: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      results: [],
    };
  }

  const chunkQuestions = results.filter((r) => r.id !== 'eval-5');
  const hits = chunkQuestions.filter((r) => r.hitRateMatch).length;
  const hitRate = (hits / (chunkQuestions.length || 1)) * 100;

  const negativeQuestions = results.filter((r) => r.id === 'eval-5');
  const failFastSuccesses = negativeQuestions.filter((r) => r.status === 'INSUFFICIENT_DATA').length;
  const failFastAccuracy = (failFastSuccesses / (negativeQuestions.length || 1)) * 100;

  const totalCoverage = results.reduce((acc, r) => acc + r.keywordCoverage, 0);
  const avgKeywordCoverage = (totalCoverage / results.length) * 100;

  const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
  const avgLatencyMs = Math.round(totalLatency / results.length);

  const sortedLatencies = [...results.map((r) => r.latencyMs)].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95LatencyMs = sortedLatencies[p95Index] || avgLatencyMs;

  return {
    totalEvaluated: results.length,
    hitRate: Math.round(hitRate * 10) / 10,
    failFastAccuracy: Math.round(failFastAccuracy * 10) / 10,
    avgKeywordCoverage: Math.round(avgKeywordCoverage * 10) / 10,
    avgLatencyMs,
    p95LatencyMs,
    results,
  };
}
