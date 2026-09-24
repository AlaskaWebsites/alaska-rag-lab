import { Queue } from 'bullmq';
import { env } from '../../../core/config/env.js';
import type { IngestionJobData } from './ingestion.worker.js';

export const ingestionQueue = new Queue<IngestionJobData>('document-ingestion', {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
});

export async function enqueueDocument(data: IngestionJobData) {
  const job = await ingestionQueue.add('process-document', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
  });

  return job;
}
