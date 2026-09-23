import { startIngestionWorker } from '../modules/ingestion/ingestion.worker.js';

console.log('🚀 Iniciando Worker BullMQ de Ingestão de Conhecimento...');
const worker = startIngestionWorker();

process.on('SIGINT', async () => {
  console.log('Fechando worker...');
  await worker.close();
  process.exit(0);
});
