import { env } from '../core/config/env.js';
import { pool } from '../core/database/db.js';
import { OllamaService } from '../modules/ai-engine/providers/ollama.service.js';

async function search(queryText: string) {
  const ollama = new OllamaService();

  console.log(`\n🔍 Pergunta: "${queryText}"`);
  console.log('⚡ 1. Vetorizando a pergunta via Ollama (nomic-embed-text)...');

  const startEmbedding = performance.now();
  const queryEmbedding = await ollama.generateEmbedding(queryText);
  const embeddingLatency = (performance.now() - startEmbedding).toFixed(2);
  console.log(`   Vetor de 768 dimensões gerado em ${embeddingLatency}ms`);

  console.log('📊 2. Executando busca por distância de cosseno (<=>) no pgvector...');
  const startDb = performance.now();

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
    LIMIT 3;
  `;

  const result = await pool.query(query, [JSON.stringify(queryEmbedding)]);
  const dbLatency = (performance.now() - startDb).toFixed(2);
  console.log(`   Busca vetorial concluída no Postgres em ${dbLatency}ms\n`);

  console.log('🏆 RANKING DE CANDIDATOS RECUPERADOS (Top 3):');
  console.log('='.repeat(75));

  result.rows.forEach((row, i) => {
    console.log(`Posição #${i + 1} | Chunk Index: [${row.chunk_index}]`);
    console.log(`Similaridade de Cosseno: ${row.similaridade} (Distância: ${row.distancia_cosseno})`);
    console.log(`Documento: "${row.doc_title}"`);
    console.log(`Trecho recuperado:\n"${row.content.trim().slice(0, 160)}..."`);
    console.log('-'.repeat(75));
  });

  await pool.end();
}

const inputQuestion =
  process.argv[2] ?? 'Como são tratados os preços e valores monetários no sistema?';

search(inputQuestion).catch((err) => {
  console.error('Erro na busca vetorial:', err);
  process.exit(1);
});
