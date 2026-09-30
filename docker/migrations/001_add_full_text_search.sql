-- Migration 001: Adicionar suporte a Full-Text Search (Busca Léxica) na tabela document_chunks
-- Gera automaticamente o vetor de texto léxico em português e aplica o índice GIN

ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS tsv tsvector 
GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv 
ON document_chunks 
USING gin (tsv);
