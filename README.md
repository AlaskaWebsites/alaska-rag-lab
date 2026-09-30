# Alaska RAG Lab 🚀

Laboratório prático de arquitetura **RAG Bare Metal** e orquestração determinística de agentes autônomos com foco em ingestão assíncrona, inferência em tempo real, controle de latência e validação fail-fast.

---

## 🎯 Objetivo

Validar e consolidar na prática os conceitos dos mapas mentais de Engenharia de IA e Agentes Autônomos (Aulas 1, 2 e 3), rodando um ambiente 100% local com **NestJS**, **PostgreSQL + pgvector**, **Ollama** e **Zod**.

---

## 🛠️ Stack Tecnológica

- **Runtime & Framework**: Node.js, TypeScript e NestJS
- **Banco Vetorial & Léxico**: PostgreSQL 16 com extensão `pgvector` (HNSW) e Full-Text Search (GIN)
- **Fila & Processamento Assíncrono**: BullMQ + Redis
- **LLM & Embeddings Locais**: Ollama (`nomic-embed-text` para 768 dimensões e `llama3` para inferência)
- **Contratos & Validação**: Zod (Structured Outputs e Fail-Fast)
- **Testes**: Vitest

---

## 📁 Estrutura Modular Refinada (Package by Feature / Clean Arch)

```text
alaska-rag-lab/
├── data/
│   └── sample-knowledge.md               # Documento Markdown corporativo para testes
├── docker/
│   ├── init.sql                          # Extensão vector, FTS (GIN), tabelas e índice HNSW
│   └── migrations/
│       └── 001_add_full_text_search.sql  # Migration para FTS (Marco 1)
├── src/
│   ├── core/                             # Camada transversal (Kernel do sistema)
│   │   ├── common/
│   │   │   └── pipes/
│   │   │       └── zod-validation.pipe.ts  # Pipe de validação fail-fast para DTOs
│   │   ├── config/
│   │   │   └── env.ts                    # Variáveis de ambiente validadas com Zod
│   │   └── database/
│   │       └── db.ts                     # Pool de conexões PostgreSQL
│   ├── modules/                          # Domínios e funcionalidades de negócio
│   │   ├── ai-engine/                    # 1. Provedor agnóstico de IA
│   │   │   ├── providers/
│   │   │   │   └── ollama.service.ts     # Client HTTP REST para o Ollama
│   │   │   └── ai-engine.module.ts
│   │   ├── ingestion/                    # 2. Esteira de ingestão assíncrona (Escrita)
│   │   │   ├── domain/                   # Regras puras de fatiamento
│   │   │   │   ├── chunker.ts
│   │   │   │   └── chunker.spec.ts
│   │   │   ├── jobs/                     # Fila e worker BullMQ
│   │   │   │   ├── ingestion.service.ts  # Produtor de jobs
│   │   │   │   └── ingestion.worker.ts   # Operário transacional com pgvector
│   │   │   └── ingestion.module.ts
│   │   └── rag/                          # 3. Motor RAG de inferência e consulta (Leitura)
│   │       ├── domain/                   # Regras puras de fusão e ranking
│   │       │   ├── rrf.ts                # Algoritmo Reciprocal Rank Fusion (RRF)
│   │       │   └── rrf.spec.ts           # Testes unitários do RRF (Vitest)
│   │       ├── controllers/
│   │       │   └── rag.controller.ts     # Entrada HTTP (POST /rag/ask)
│   │       ├── dtos/
│   │       │   └── rag.dto.ts            # Contrato de entrada da request
│   │       ├── schemas/
│   │       │   ├── rag.schema.ts         # Contrato de saída da LLM (Zod)
│   │       │   └── rag.schema.spec.ts    # Testes unitários do contrato
│   │       ├── services/
│   │       │   └── rag.service.ts        # Orquestrador RAG com Busca Híbrida + RRF
│   │       └── rag.module.ts
│   ├── scripts/                          # Ferramentas CLI auxiliares
│   │   ├── ask.ts                        # Runner CLI para perguntas
│   │   ├── ingest-file.ts                # Runner CLI para enfileirar documentos
│   │   ├── run-worker.ts                 # Runner CLI para o worker BullMQ
│   │   └── test-search.ts                # Runner CLI para teste de busca híbrida com RRF
│   ├── app.module.ts                     # Módulo raiz NestJS
│   └── main.ts                           # Bootstrap HTTP NestJS
├── docker-compose.yml                    # Orquestração do Postgres (pgvector) e Redis
├── package.json
└── tsconfig.json
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos (Ollama)
```bash
ollama pull nomic-embed-text
ollama pull llama3
```

### 2. Subir a Infraestrutura (PostgreSQL + pgvector + Redis)
```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

### 3. Aplicar Migration do Full-Text Search (FTS)
```bash
docker compose exec postgres psql -U postgres -d alaska_rag_db -c "
  ALTER TABLE document_chunks 
  ADD COLUMN IF NOT EXISTS tsv tsvector 
  GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED;
  CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv ON document_chunks USING gin (tsv);
"
```

### 4. Instalar Dependências e Executar Testes (Vitest)
```bash
npm install
npm test
```

### 5. Ingestão Assíncrona de Documentos (Passo 1)
```bash
# Terminal 1: Inicia o worker BullMQ
npm run worker

# Terminal 2: Enfileira o documento técnico
npm run ingest
```

### 6. Testar Busca Híbrida com RRF (Passo 4 - Marco 2)
```bash
# Teste com pergunta de telefone (FTS + Vetor):
npm run search -- "Tem algum telefone pra contato?"

# Teste com número exato:
npm run search -- "11969124940"

# Teste com ferramentas técnicas:
npm run search -- "BullMQ e Redis"
```

### 7. Executar o Servidor HTTP NestJS
Inicie o servidor com hot reload:
```bash
npm run start:dev
```
A API estará disponível em: `http://localhost:3000/rag/ask`.

---

## 📋 Roteiro de Implementação

### Passo 1: Esteira de Ingestão de Conhecimento (Offline / Worker)
- [x] Subir container Docker com PostgreSQL e extensão `pgvector`.
- [x] Configurar tabela para armazenar chunks, embeddings e metadados contextuais (documento, página, autor).
- [x] Desenvolver worker desacoplado com BullMQ para leitura de arquivos Markdown/docs.
- [x] Implementar chunking semântico equilibrado (~300 a 400 tokens por fragmento com overlap).
- [x] Gerar embeddings locais via Ollama (`nomic-embed-text`) e persistir com integridade transacional.

### Passo 2: Pipeline de Inferência em Tempo Real (Busca & Reranking)
- [x] Criar endpoint HTTP no NestJS para receber perguntas do usuário (`POST /rag/ask`).
- [x] Vetorizar a consulta recebida em tempo real utilizando o mesmo modelo de embeddings da ingestão (`nomic-embed-text`).
- [x] Executar busca vetorial por distância de cosseno (`<=>`) no `pgvector` com índice HNSW.
- [x] Aplicar filtro cirúrgico de contexto (top 3 chunks mais relevantes) mitigando o efeito *Lost in the Middle*.

### Passo 3: Geração Controlada & Validação Fail-Fast
- [x] Montar prompt cirúrgico injetando apenas as evidências aprovadas no contexto.
- [x] Realizar chamada à LLM local via Ollama forçando saída estruturada em JSON (`format: 'json'`).
- [x] Definir schema Zod estrito (`RagResponseSchema`) para validar a saída em tempo de execução.
- [x] Implementar barreira *fail-fast*: se a resposta for incompleta, inválida ou faltar contexto, retornar deterministicamente a flag `INSUFFICIENT_DATA`, bloqueando alucinações.
- [x] Adicionar telemetria biônica com medição de latência ponta a ponta e flag `debug: true`.

### Passo 4: RAG Nível 2 (Refinamento & Recuperação Avançada)
- [x] **Marco 1: Busca Híbrida no PostgreSQL (Dense + Sparse)**:
  - [x] Coluna gerada `tsv tsvector` com dicionário em português na tabela `document_chunks`.
  - [x] Índice GIN (`idx_document_chunks_tsv`) para busca de texto completo em sub-milissegundos.
  - [x] Script `test-search.ts` atualizado para comparar busca vetorial (HNSW) vs. léxica (GIN) lado a lado.
- [x] **Marco 2: Algoritmo de Fusão RRF (Reciprocal Rank Fusion)**:
  - [x] Implementar função pura `reciprocalRankFusion` em `src/modules/rag/domain/rrf.ts`.
  - [x] Criar testes unitários com Vitest (`rrf.spec.ts`).
  - [x] Integrar Busca Híbrida Paralela + Fusão RRF no `rag.service.ts` e no endpoint HTTP.
  - [x] Exibir ranking consolidado RRF no CLI `test-search.ts`.
- [ ] **Marco 3: Cache Semântico no Redis**:
  - [ ] Armazenar pares de perguntas e respostas no Redis com similaridade de embedding >= 0.95.
  - [ ] Retornar respostas instantâneas (<10ms) em caso de Cache Hit.
- [ ] **Marco 4: Observabilidade Expandida & RAG Evals**:
  - [ ] Métricas detalhadas de Cache Hit/Miss e scores RRF na telemetria.
  - [ ] Teste de fidelidade e relevância do contexto.
