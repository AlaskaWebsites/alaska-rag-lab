# Alaska RAG Lab 🚀

Laboratório prático de arquitetura **RAG Bare Metal** e orquestração determinística de agentes autônomos com foco em ingestão assíncrona, inferência em tempo real, controle de latência e validação fail-fast.

---

## 🎯 Objetivo

Validar e consolidar na prática os conceitos dos mapas mentais de Engenharia de IA e Agentes Autônomos (Aulas 1 e 2), rodando um ambiente 100% local com **NestJS**, **PostgreSQL + pgvector**, **Ollama** e **Zod**.

---

## 🛠️ Stack Tecnológica

- **Runtime & Framework**: Node.js, TypeScript e NestJS
- **Banco Vetorial**: PostgreSQL 16 com extensão `pgvector` e índice **HNSW**
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
│   └── init.sql                          # Extensão vector, tabelas e índice HNSW
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
│   │       ├── controllers/
│   │       │   └── rag.controller.ts     # Entrada HTTP (POST /rag/ask)
│   │       ├── dtos/
│   │       │   └── rag.dto.ts            # Contrato de entrada da request
│   │       ├── schemas/
│   │       │   ├── rag.schema.ts         # Contrato de saída da LLM (Zod)
│   │       │   └── rag.schema.spec.ts    # Testes unitários do contrato
│   │       ├── services/
│   │       │   └── rag.service.ts        # Orquestrador RAG com telemetria biônica
│   │       └── rag.module.ts
│   ├── scripts/                          # Ferramentas CLI auxiliares
│   │   ├── ask.ts                        # Runner CLI para perguntas
│   │   ├── ingest-file.ts                # Runner CLI para enfileirar documentos
│   │   ├── run-worker.ts                 # Runner CLI para o worker BullMQ
│   │   └── test-search.ts                # Runner CLI para teste de busca por cosseno (<=>)
│   ├── app.module.ts                     # Módulo raiz NestJS
│   └── main.ts                           # Bootstrap HTTP NestJS
├── docker-compose.yml                    # Orquestração do Postgres (pgvector) e Redis
├── package.json
└── tsconfig.json
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos (Ollama)
Certifique-se de ter o Ollama instalado com os modelos:
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

### 3. Instalar Dependências e Executar Testes
```bash
npm install
npm test
```

### 4. Ingestão Assíncrona de Documentos (Passo 1)
Em dois terminais separados:
```bash
# Terminal 1: Inicia o worker BullMQ
npm run worker

# Terminal 2: Enfileira o documento técnico
npm run ingest
```

### 5. Executar o Servidor HTTP NestJS
Inicie o servidor com hot reload:
```bash
npm run start:dev
```
A API estará disponível em: `http://localhost:3000/rag/ask`.

---

## 📡 Como Chamar o Endpoint HTTP

### Exemplo 1: Pergunta respondível com telemetria (Visão Biônica)
```bash
curl -X POST http://localhost:3000/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Como são tratados os preços e valores monetários no sistema?",
    "debug": true
  }'
```

### Exemplo 2: Pergunta fora do escopo (Fail-Fast / Insufficient Data)
```bash
curl -X POST http://localhost:3000/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Qual a receita secreta da torta de maçã?"}'
```

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
