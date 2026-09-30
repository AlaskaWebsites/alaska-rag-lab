/**
 * Converte uma pergunta conversacional em termos de busca léxica com operador OR.
 * Ex: "Tem algum telefone pra contato?" -> "telefone or contato"
 */
export function buildLexicalQuery(text: string): string {
  const words = text
    .replace(/[^\w\s\d]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  if (words.length === 0) return text;
  return words.join(' or ');
}

export interface ScoredCandidate {
  id: string;
  chunkIndex: number;
  documentTitle: string;
  content: string;
  vectorSimilarity?: number;
  textScore?: number;
}

export interface FusedCandidate extends ScoredCandidate {
  rrfScore: number;
  matchOrigins: ('vector' | 'fulltext')[];
}

/**
 * Algoritmo Reciprocal Rank Fusion (RRF).
 * Combina múltiplos rankings de recuperação (ex: busca vetorial densa + busca léxica FTS)
 * em uma lista ordenada única, balanceando a pontuação por posição relativa.
 *
 * Fórmula: RRF(d) = SUM(1 / (k + rank(d)))
 * @param rankings Coleção de rankings identificados por nome
 * @param k Constante de amortecimento (padrão empírico da literatura: 60)
 */
export function reciprocalRankFusion(
  rankings: { origin: 'vector' | 'fulltext'; items: ScoredCandidate[] }[],
  k: number = 60
): FusedCandidate[] {
  const scoreMap = new Map<
    string,
    { candidate: ScoredCandidate; rrfScore: number; origins: Set<'vector' | 'fulltext'> }
  >();

  for (const ranking of rankings) {
    ranking.items.forEach((item, index) => {
      const rank = index + 1; // 1-based rank
      const score = 1 / (k + rank);

      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.rrfScore += score;
        existing.origins.add(ranking.origin);
        // Preserva scores numéricos originais
        if (item.vectorSimilarity !== undefined) {
          existing.candidate.vectorSimilarity = item.vectorSimilarity;
        }
        if (item.textScore !== undefined) {
          existing.candidate.textScore = item.textScore;
        }
      } else {
        scoreMap.set(item.id, {
          candidate: { ...item },
          rrfScore: score,
          origins: new Set([ranking.origin]),
        });
      }
    });
  }

  const fusedList: FusedCandidate[] = Array.from(scoreMap.values()).map(
    ({ candidate, rrfScore, origins }) => ({
      ...candidate,
      rrfScore: Math.round(rrfScore * 100000) / 100000,
      matchOrigins: Array.from(origins),
    })
  );

  // Ordena pelo maior score RRF composto
  fusedList.sort((a, b) => b.rrfScore - a.rrfScore);

  return fusedList;
}
