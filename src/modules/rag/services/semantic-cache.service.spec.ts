import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from './semantic-cache.service.js';

describe('SemanticCacheService - Cosine Similarity', () => {
  it('deve retornar 1.0 para vetores idênticos', () => {
    const vecA = [1, 2, 3, 4];
    const vecB = [1, 2, 3, 4];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
  });

  it('deve retornar 0.0 para vetores ortogonais (sem relação)', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('deve calcular alta similaridade (> 0.95) para vetores semanticamente próximos', () => {
    const vecA = [0.1, 0.8, -0.4, 0.5];
    const vecB = [0.11, 0.79, -0.39, 0.51];
    expect(cosineSimilarity(vecA, vecB)).toBeGreaterThan(0.98);
  });

  it('deve retornar 0 se algum dos vetores for vazio', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });
});
