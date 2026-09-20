import { describe, it, expect } from 'vitest';
import { chunkDocument } from './chunker.js';

describe('chunkDocument', () => {
  it('deve dividir um texto longo respeitando parágrafos e gerando chunks indexados', () => {
    const text = `
# Arquitetura Alaska Local

O Alaska Local é um ecossistema multi-tenant focado em pequenos e médios lojistas.
Ele oferece catálogo digital, agendamento de serviços e pedidos diretos no WhatsApp.

## Camada de Backend
O backend foi construído com NestJS 11 e Clean Architecture.
Utilizamos o PostgreSQL com RLS para isolamento de dados entre empresas.

## Motor de Ingestão Vetorial
A ingestão utiliza BullMQ para desacoplar tarefas pesadas.
Cada chunk é salvo no pgvector com índice HNSW para busca rápida.
`.trim();

    const chunks = chunkDocument(text, { targetTokens: 50, overlapTokens: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].content).toContain('Arquitetura Alaska Local');
    expect(chunks[0].metadata.estimatedTokens).toBeGreaterThan(0);
  });
});
