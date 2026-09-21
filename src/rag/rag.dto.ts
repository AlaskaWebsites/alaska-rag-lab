import { z } from 'zod';

export const AskQuestionDtoSchema = z.object({
  question: z
    .string({ required_error: 'O campo "question" é obrigatório' })
    .min(3, 'A pergunta deve ter no mínimo 3 caracteres'),
  topK: z.number().int().min(1).max(10).optional().default(3),
});

export type AskQuestionDto = z.infer<typeof AskQuestionDtoSchema>;
