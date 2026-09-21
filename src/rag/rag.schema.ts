import { z } from 'zod';

/**
 * Contrato estrito para a resposta final da LLM no pipeline RAG.
 * Aplica o princípio fail-fast: qualquer desvio de formato ou falta
 * de evidências no contexto é capturado deterministicamente.
 */
export const RagResponseSchema = z.object({
  status: z.enum(['SUCCESS', 'INSUFFICIENT_DATA']),
  answer: z
    .string()
    .describe(
      'Resposta clara, direta e objetiva fundamentada unicamente nas fontes recuperadas, ou explicação caso faltem dados.'
    ),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE']),
  sources: z
    .array(
      z.object({
        documentTitle: z.string(),
        chunkIndex: z.number(),
        relevanceScore: z.number(),
      })
    )
    .describe('Lista das fontes aprovadas e utilizadas para responder.'),
});

export type RagResponse = z.infer<typeof RagResponseSchema>;
