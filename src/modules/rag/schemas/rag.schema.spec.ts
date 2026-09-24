import { describe, it, expect } from 'vitest';
import { RagResponseSchema } from './rag.schema.js';

describe('RagResponseSchema', () => {
  it('deve validar com sucesso uma resposta correta no formato esperado', () => {
    const validPayload = {
      status: 'SUCCESS',
      answer: 'Os valores são armazenados em centavos inteiros via Value Object.',
      confidence: 'HIGH',
      sources: [
        {
          documentTitle: 'Arquitetura Alaska Local',
          chunkIndex: 1,
          relevanceScore: 0.85,
        },
      ],
    };

    const parsed = RagResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('deve aceitar status INSUFFICIENT_DATA com confidence NONE', () => {
    const insufficientPayload = {
      status: 'INSUFFICIENT_DATA',
      answer: 'Não constam informações sobre essa pergunta no contexto.',
      confidence: 'NONE',
      sources: [],
    };

    const parsed = RagResponseSchema.safeParse(insufficientPayload);
    expect(parsed.success).toBe(true);
  });

  it('deve rejeitar respostas que não possuem os campos obrigatórios (Fail-Fast)', () => {
    const invalidPayload = {
      answer: 'Resposta solta sem status ou fontes',
    };

    const parsed = RagResponseSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });
});
