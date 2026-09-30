import { describe, it, expect } from 'vitest';
import {
  evaluateResponse,
  generateEvalReport,
  type GoldenItem,
} from './rag-eval.service.js';
import type { RagResponse } from '../schemas/rag.schema.js';

describe('RAG Evals - Suíte de Avaliação Automatizada', () => {
  it('deve avaliar com nota 100% uma resposta correta com o chunk esperado e palavras-chave', () => {
    const item: GoldenItem = {
      id: 'eval-1',
      question: 'Como são tratados os preços?',
      expectedKeywords: ['centavos inteiros'],
      expectedChunkIndex: 1,
      expectedStatus: 'SUCCESS',
    };

    const response: RagResponse = {
      status: 'SUCCESS',
      answer: 'Os preços são mantidos em centavos inteiros via Value Object.',
      confidence: 'HIGH',
      sources: [
        {
          documentTitle: 'Arquitetura Alaska Local',
          chunkIndex: 1,
          relevanceScore: 0.8,
        },
      ],
    };

    const result = evaluateResponse(item, response, 1500, false);

    expect(result.statusMatch).toBe(true);
    expect(result.hitRateMatch).toBe(true);
    expect(result.keywordCoverage).toBe(1.0);
  });

  it('deve validar corretamente a barreira de Fail-Fast para perguntas fora de escopo', () => {
    const item: GoldenItem = {
      id: 'eval-5',
      question: 'Qual a receita da torta?',
      expectedKeywords: [],
      expectedChunkIndex: null,
      expectedStatus: 'INSUFFICIENT_DATA',
    };

    const response: RagResponse = {
      status: 'INSUFFICIENT_DATA',
      answer: 'Informação não encontrada no contexto.',
      confidence: 'NONE',
      sources: [],
    };

    const result = evaluateResponse(item, response, 50, false);

    expect(result.statusMatch).toBe(true);
    expect(result.hitRateMatch).toBe(true);
  });

  it('deve gerar o relatório consolidado com métricas de Hit Rate e Latência', () => {
    const itemA: GoldenItem = {
      id: 'eval-1',
      question: 'Q1',
      expectedKeywords: ['A'],
      expectedChunkIndex: 0,
      expectedStatus: 'SUCCESS',
    };
    const resA: RagResponse = {
      status: 'SUCCESS',
      answer: 'Tem A',
      confidence: 'HIGH',
      sources: [{ documentTitle: 'Doc', chunkIndex: 0, relevanceScore: 1 }],
    };

    const resultA = evaluateResponse(itemA, resA, 100);
    const report = generateEvalReport([resultA]);

    expect(report.totalEvaluated).toBe(1);
    expect(report.hitRate).toBe(100);
    expect(report.avgKeywordCoverage).toBe(100);
    expect(report.avgLatencyMs).toBe(100);
  });
});
