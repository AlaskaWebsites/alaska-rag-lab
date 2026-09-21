import { RagService } from '../rag/rag.service.js';
import { pool } from '../database/db.js';

async function main() {
  const question =
    process.argv[2] ?? 'Como são tratados os preços e valores monetários no sistema?';

  const rag = new RagService();

  console.log(`\n🤖 Pergunta: "${question}"`);
  console.log('⏳ Executando pipeline RAG (pgvector + Rerank Cirúrgico + Ollama + Zod)...');

  const start = performance.now();
  const response = await rag.ask(question);
  const totalDuration = ((performance.now() - start) / 1000).toFixed(2);

  console.log(`\n⏱️ Pipeline finalizado em ${totalDuration}s`);
  console.log('='.repeat(70));
  console.log(`STATUS:      [${response.status}]`);
  console.log(`CONFIANÇA:   [${response.confidence}]`);
  console.log(`RESPOSTA:`);
  console.log(response.answer);
  console.log('-'.repeat(70));

  if (response.sources.length > 0) {
    console.log('FONTES CITADAS:');
    response.sources.forEach((s) => {
      console.log(` - Doc: "${s.documentTitle}" (Chunk #${s.chunkIndex})`);
    });
  } else {
    console.log('Nenhuma fonte relevante encontrada para sustentar a resposta.');
  }
  console.log('='.repeat(70) + '\n');

  await pool.end();
}

main().catch((err) => {
  console.error('Erro na execução do RAG:', err);
  process.exit(1);
});
