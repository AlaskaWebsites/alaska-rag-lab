import path from 'node:path';
import { enqueueDocument } from '../modules/ingestion/jobs/ingestion.service.js';

async function main() {
  const targetFile = process.argv[2] ?? 'data/sample-knowledge.md';
  const resolvedPath = path.resolve(process.cwd(), targetFile);

  console.log(`📤 Enviando documento para a fila BullMQ: ${resolvedPath}`);

  const job = await enqueueDocument({
    filePath: resolvedPath,
    title: 'Arquitetura e Padrões Alaska Local',
    source: targetFile,
    author: 'Danilo Gozzi',
  });

  console.log(`✅ Job registrado com sucesso na fila! ID do Job: ${job.id}`);
  console.log('💡 Certifique-se de que o worker está rodando em outro terminal: npm run worker');
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao enfileirar documento:', err);
  process.exit(1);
});
