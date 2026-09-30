import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion, buildLexicalQuery, type ScoredCandidate } from './rrf.js';

describe('RRF - Reciprocal Rank Fusion', () => {
  it('deve extrair palavras relevantes e unir com operador OR', () => {
    const query = 'Tem algum telefone pra contato?';
    const lexical = buildLexicalQuery(query);
    expect(lexical).toBe('Tem or algum or telefone or pra or contato');
  });

  it('deve ranquear no topo um documento que aparece em primeiro em ambos os rankings', () => {
    const candidateA: ScoredCandidate = {
      id: 'doc-1',
      chunkIndex: 0,
      documentTitle: 'Doc A',
      content: 'Conteúdo A',
      vectorSimilarity: 0.85,
    };

    const candidateB: ScoredCandidate = {
      id: 'doc-2',
      chunkIndex: 1,
      documentTitle: 'Doc B',
      content: 'Conteúdo B',
      vectorSimilarity: 0.70,
    };

    const vectorRanking = {
      origin: 'vector' as const,
      items: [candidateA, candidateB],
    };

    const textRanking = {
      origin: 'fulltext' as const,
      items: [candidateA], // candidateA também venceu na busca textual
    };

    const fused = reciprocalRankFusion([vectorRanking, textRanking], 60);

    expect(fused.length).toBe(2);
    expect(fused[0].id).toBe('doc-1');
    expect(fused[0].matchOrigins).toContain('vector');
    expect(fused[0].matchOrigins).toContain('fulltext');
    // RRF score deve ser 1/(60+1) + 1/(60+1) = 2/61 ~= 0.03279
    expect(fused[0].rrfScore).toBeGreaterThan(fused[1].rrfScore);
  });

  it('deve combinar candidatos que aparecem em apenas um dos rankings', () => {
    const candidateA: ScoredCandidate = {
      id: 'doc-1',
      chunkIndex: 0,
      documentTitle: 'Doc A',
      content: 'Conteúdo A',
      vectorSimilarity: 0.9,
    };

    const candidateB: ScoredCandidate = {
      id: 'doc-2',
      chunkIndex: 1,
      documentTitle: 'Doc B',
      content: 'Conteúdo B',
      textScore: 0.5,
    };

    const vectorRanking = { origin: 'vector' as const, items: [candidateA] };
    const textRanking = { origin: 'fulltext' as const, items: [candidateB] };

    const fused = reciprocalRankFusion([vectorRanking, textRanking], 60);

    expect(fused.length).toBe(2);
    expect(fused.map((f) => f.id)).toContain('doc-1');
    expect(fused.map((f) => f.id)).toContain('doc-2');
  });
});
