-- Habilita a extensão pgvector para suporte a tipos vetoriais e cálculos de distância
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela pai para rastrear documentos ou arquivos originais
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    source VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de chunks fragmentados com suporte a Busca Vetorial (Dense) e Busca Léxica (Sparse/FTS)
-- Dimensão 768: compatível nativamente com o nomic-embed-text do Ollama
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb, -- ex: {"page": 1, "author": "Danilo", "tokens": 350}
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices relacionais
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

-- Índice HNSW (Hierarchical Navigable Small World) para busca vetorial por cosseno (<=>)
-- Otimizado para alta performance e baixa latência na recuperação semântica
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índice GIN (Generalized Inverted Index) para Busca de Texto Completo (Full-Text Search)
-- Otimizado para casar palavras exatas, termos técnicos, siglas e números em sub-milissegundos
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv 
ON document_chunks 
USING gin (tsv);
