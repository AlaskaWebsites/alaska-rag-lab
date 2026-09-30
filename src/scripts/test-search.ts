import { pool } from '../core/database/db.js';
import { OllamaService } from '../modules/ai-engine/providers/ollama.service.js';
import {
  reciprocalRankFusion,
  buildLexicalQuery,
  type ScoredCandidate,
} from '../modules/rag/domain/rrf.js';

async function hybridSearchWithRRF(queryText: string, topK: number = 3) {
  const ollama = new OllamaService();
  const lexicalQuery = buildLexicalQuery(queryText);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔬 [RAG NÍVEL 2: BUSCA HÍBRIDA + RECIPROCAL RANK FUSION (RRF)]`);
  console.log(`❓ Pergunta Original: "${queryText}"`);
  console.log(`🔤 Expressão Léxica:   "${lexicalQuery}"`);
  console.log(`${'='.repeat(80)}`);

  // 1. Busca Vetorial (Dense Retrieval)
  console.log('\n🧠 1. RANKING VETORIAL (DENSE) — Semântica:');
  const startVec = performance.now();
  const queryEmbedding = await ollama.generateEmbedding(queryText);
  const vecGenMs = (performance.now() - startVec).toFixed(2);

  const startDbVec = performance.now();
  const vectorQuery = `
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
  const vectorResult = await pool.query(vectorQuery, [
    JSON.stringify(queryEmbedding),
    topK * 2,
  ]);
  const vecDbMs = (performance.now() - startDbVec).toFixed(2);

  console.log(`   ⚡ Vetor em ${vecGenMs}ms | Consulta pgvector em ${vecDbMs}ms`);
  const vectorCandidates: ScoredCandidate[] = vectorResult.rows.map((row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    documentTitle: row.doc_title,
    content: row.content,
    vectorSimilarity: parseFloat(row.similaridade),
  }));

  vectorCandidates.slice(0, topK).forEach((c, i) => {
    console.log(
      `   #${i + 1} | Chunk [${c.chunkIndex}] | Similaridade: ${(c.vectorSimilarity! * 100).toFixed(1)}%`
    );
  });

  // 2. Busca Léxica (Sparse / FTS)
  console.log('\n📖 2. RANKING LÉXICO (SPARSE / FTS) — Palavras Exatas:');
  const startFts = performance.now();
  const ftsQuery = `
    SELECT 
      c.id,
      c.chunk_index,
      d.title AS doc_title,
      c.content,
      ROUND(ts_rank_cd(c.tsv, websearch_to_tsquery('portuguese', $1))::numeric, 4) AS text_score,
      ts_headline(
        'portuguese', 
        c.content, 
        websearch_to_tsquery('portuguese', $1), 
        'StartSel=>>>, StopSel=<<<, MaxWords=25, MinWords=10'
      ) AS snippet
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.tsv @@ websearch_to_tsquery('portuguese', $1)
    ORDER BY text_score DESC
    LIMIT $2;
  `;
  const ftsResult = await pool.query(ftsQuery, [lexicalQuery, topK * 2]);
  const ftsMs = (performance.now() - startFts).toFixed(2);

  console.log(`   ⚡ FTS com índice GIN em ${ftsMs}ms`);
  const textCandidates: ScoredCandidate[] = ftsResult.rows.map((row) => ({
    id: row.id,
    chunkIndex: row.chunk_index,
    documentTitle: row.doc_title,
    content: row.content,
    textScore: parseFloat(row.text_score),
  }));

  if (textCandidates.length === 0) {
    console.log('   ⚠️ Nenhum match exato encontrado pelo Full-Text Search.');
  } else {
    textCandidates.slice(0, topK).forEach((c, i) => {
      console.log(`   #${i + 1} | Chunk [${c.chunkIndex}] | Score FTS: ${c.textScore}`);
    });
  }

  // 3. O Pulo do Gato: Reciprocal Rank Fusion (RRF)
  console.log('\n🏆 3. RANKING FINAL CONSOLIDADO VIA RECIPROCAL RANK FUSION (RRF):');
  console.log('   Fórmula: RRF(d) = SUM(1 / (60 + rank(d)))');
  console.log('   ' + '-'.repeat(76));

  const fused = reciprocalRankFusion(
    [
      { origin: 'vector', items: vectorCandidates },
      { origin: 'fulltext', items: textCandidates },
    ],
    60
  );

  fused.slice(0, topK).forEach((c, i) => {
    console.log(`   Posição #${i + 1} | Chunk [${c.chunkIndex}] | RRF Score: ${c.rrfScore}`);
    console.log(`      Origens de Match: [${c.matchOrigins.join(' + ').toUpperCase()}]`);
    if (c.vectorSimilarity) {
      console.log(`      Similaridade Vetorial: ${(c.vectorSimilarity * 100).toFixed(1)}%`);
    }
    if (c.textScore) {
      console.log(`      Pontuação Léxica FTS: ${c.textScore}`);
    }
    console.log(`      Trecho: "${c.content.trim().slice(0, 100)}..."`);
    console.log('   ' + '-'.repeat(76));
  });

  console.log(`${'='.repeat(80)}\n`);
  await pool.end();
}

const inputQuestion = process.argv[2] ?? 'Tem algum telefone pra contato?';

hybridSearchWithRRF(inputQuestion).catch((err) => {
  console.error('Erro na busca híbrida com RRF:', err);
  process.exit(1);
});
