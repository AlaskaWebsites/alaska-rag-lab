import { Worker, Job } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { pool } from '../database/db.js';
import { chunkDocument } from './chunker.js';
import { OllamaService } from '../ollama/ollama.service.js';

export interface IngestionJobData {
  filePath: string;
  title: string;
  source?: string;
  author?: string;
}

export function startIngestionWorker() {
  const ollama = new OllamaService();

  const worker = new Worker<IngestionJobData>(
    'document-ingestion',
    async (job: Job<IngestionJobData>) => {
      const { filePath, title, source, author } = job.data;
      console.log(`[Worker] Iniciando ingestão do job #${job.id}: "${title}"`);

      // 1. Extração do conteúdo
      const rawText = await readFile(filePath, 'utf-8');
      console.log(`[Worker] Arquivo lido com sucesso (${rawText.length} caracteres).`);

      // 2. Chunking semântico (~300-400 tokens)
      const chunks = chunkDocument(rawText, { targetTokens: 350, overlapTokens: 50 });
      console.log(`[Worker] Documento fatiado em ${chunks.length} chunks semânticos.`);

      // 3. Persistência transacional com pgvector
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Cria o registro pai na tabela documents
        const docInsert = await client.query(
          `INSERT INTO documents (title, source, metadata)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [
            title,
            source ?? filePath,
            JSON.stringify({ author: author ?? 'Sistema', totalChunks: chunks.length }),
          ]
        );
        const documentId = docInsert.rows[0].id;

        // 4. Geração de embedding e gravação de cada chunk
        for (const chunk of chunks) {
          console.log(
            `[Worker] Gerando embedding do chunk ${chunk.index + 1}/${chunks.length} via Ollama...`
          );
          const embedding = await ollama.generateEmbedding(chunk.content);

          await client.query(
            `INSERT INTO document_chunks (document_id, content, chunk_index, embedding, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              documentId,
              chunk.content,
              chunk.index,
              JSON.stringify(embedding), // pgvector faz o cast automático de JSON array para vector
              JSON.stringify({
                tokens: chunk.metadata.estimatedTokens,
                chars: chunk.metadata.charCount,
                page: 1,
              }),
            ]
          );
        }

        await client.query('COMMIT');
        console.log(
          `[Worker] Sucesso! Documento "${title}" (ID: ${documentId}) persistido com ${chunks.length} embeddings.`
        );

        return { documentId, totalChunks: chunks.length };
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[Worker] Erro durante a ingestão do documento:`, error);
        throw error;
      } finally {
        client.release();
      }
    },
    {
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
      },
      concurrency: 1, // Processamento sequencial de documentos para não sobrecarregar GPU/CPU local
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job #${job.id} concluído com sucesso!`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job #${job?.id} falhou: ${err.message}`);
  });

  return worker;
}
