import { pool } from '../core/database/db.js';
import { OllamaService } from '../modules/ai-engine/providers/ollama.service.js';

/**
 * Converte uma pergunta conversacional em termos de busca léxica com operador OR.
 * Ex: "Tem algum telefone pra contato?" -> "telefone or contato"
 * Isso evita a armadilha do operador AND estrito do plainto_tsquery quando a pergunta
 * possui palavras de preenchimento (ex: "tem", "algum", "pra").
 */
function buildLexicalQuery(text: string): string {
  const words = text
    .replace(/[^\w\s\d]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  if (words.length === 0) return text;
  return words.join(' or ');
}

async function hybridSearch(queryText: string, topK: number = 3) {
  const ollama = new OllamaService();
  const lexicalQuery = buildLexicalQuery(queryText);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔎 [MARCO 1: PROVA REAL DA BUSCA HÍBRIDA (DENSE + SPARSE)]`);
  console.log(`❓ Pergunta Original: "${queryText}"`);
  console.log(`🔤 Expressão Léxica:   "${lexicalQuery}"`);
  console.log(`${'='.repeat(80)}`);

  // 1. Busca Vetorial (Dense Retrieval via nomic-embed-text e pgvector)
  console.log('\n🧠 1. BUSCA VETORIAL (DENSE) — Foco em Conceitos e Semântica:');
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
    topK,
  ]);
  const vecDbMs = (performance.now() - startDbVec).toFixed(2);

  console.log(`   ⚡ Vetor gerado em ${vecGenMs}ms | Consulta pgvector HNSW em ${vecDbMs}ms`);
  console.log('   ' + '-'.repeat(76));
  vectorResult.rows.forEach((row, i) => {
    console.log(
      `   #${i + 1} | Chunk [${row.chunk_index}] | Similaridade: ${(row.similaridade * 100).toFixed(1)}% (Dist: ${row.distancia_cosseno})`
    );
    console.log(`      "${row.content.trim().slice(0, 110)}..."`);
  });

  // 2. Busca Léxica (Sparse Retrieval via PostgreSQL Full-Text Search com GIN e websearch_to_tsquery)
  console.log('\n📖 2. BUSCA LÉXICA (SPARSE / FTS) — Foco em Palavras Exatas, Siglas e Números:');
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
  const ftsResult = await pool.query(ftsQuery, [lexicalQuery, topK]);
  const ftsMs = (performance.now() - startFts).toFixed(2);

  console.log(`   ⚡ Consulta FTS com índice GIN concluída em ${ftsMs}ms`);
  console.log('   ' + '-'.repeat(76));

  if (ftsResult.rows.length === 0) {
    console.log('   ⚠️ Nenhum match exato de palavras encontrado pelo Full-Text Search.');
    console.log('      (Isso acontece quando nenhuma das palavras da query existe literalmente no texto).');
  } else {
    ftsResult.rows.forEach((row, i) => {
      console.log(
        `   #${i + 1} | Chunk [${row.chunk_index}] | FTS Score (ts_rank_cd): ${row.text_score}`
      );
      console.log(`      Termos Casados: ${row.snippet.trim().replace(/\n/g, ' ')}`);
    });
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`💡 INSIGHT ARQUITETURAL:`);
  console.log(`- Vetor pega o CONCEITO mesmo sem palavras iguais.`);
  console.log(`- Full-Text pega a PALAVRA EXATA (números, siglas, IDs) em sub-milissegundos.`);
  console.log(`- No Marco 2, o algoritmo RRF vai unificar esses dois rankings em um só!`);
  console.log(`${'='.repeat(80)}\n`);

  await pool.end();
}

const inputQuestion =
  process.argv[2] ?? 'Tem algum telefone pra contato?';

hybridSearch(inputQuestion).catch((err) => {
  console.error('Erro na busca híbrida:', err);
  process.exit(1);
});
