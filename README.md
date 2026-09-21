# Alaska RAG Lab 🚀

Laboratório prático de arquitetura **RAG Bare Metal** e orquestração determinística de agentes autônomos com foco em ingestão assíncrona, inferência em tempo real, controle de latência e validação fail-fast.

---

## 🎯 Objetivo

Validar e consolidar na prática os conceitos dos mapas mentais de Engenharia de IA e Agentes Autônomos (Aulas 1 e 2), rodando um ambiente 100% local com **NestJS**, **PostgreSQL + pgvector**, **Ollama** e **Zod**.

---

## 🛠️ Stack Tecnológica

- **Runtime & Framework**: Node.js, TypeScript e NestJS
- **Banco Vetorial**: PostgreSQL com extensão `pgvector`
- **Fila & Processamento Assíncrono**: BullMQ + Redis
- **LLM & Embeddings Locais**: Ollama (`nomic-embed-text` para embeddings e `llama3` para inferência)
- **Contratos & Validação**: Zod (Structured Outputs e Fail-Fast)

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
```

### 3. Instalar Dependências e Testar
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

### 5. Busca por Similaridade Vetorial no pgvector (Passo 2)
```bash
npm run search -- "Como são tratados os preços e valores monetários no sistema?"
```

### 6. Pipeline RAG Completo com Geração Controlada e Zod Fail-Fast (Passo 3)
Faça perguntas para o pipeline completo:
```bash
# Pergunta com evidências no documento:
npm run ask -- "Como são tratados os preços e valores monetários no sistema?"

# Pergunta sobre produtos:
npm run ask -- "Quais são os módulos para restaurantes e serviços?"

# Pergunta sem evidências (demonstra a flag INSUFFICIENT_DATA):
npm run ask -- "Qual a receita secreta da pizza de calabresa?"
```

---

## 📋 Roteiro de Implementação

### Passo 1: Esteira de Ingestão de Conhecimento (Offline / Worker)
- [x] Subir container Docker com PostgreSQL e extensão `pgvector`.
- [x] Configurar tabela para armazenar chunks, embeddings e metadados contextuais (documento, página, autor).
- [x] Desenvolver script/worker com BullMQ para leitura de arquivos Markdown/docs.
- [x] Implementar chunking semântico equilibrado (~300 a 400 tokens por fragmento).
- [x] Gerar embeddings locais via Ollama (`nomic-embed-text`) e persistir com integridade transacional.

### Passo 2: Pipeline de Inferência em Tempo Real (Busca & Reranking)
- [x] Vetorizar a consulta recebida em tempo real utilizando o mesmo modelo de embeddings da ingestão (`nomic-embed-text`).
- [x] Executar busca vetorial por distância de cosseno (`<=>`) no `pgvector` com índice HNSW.
- [x] Aplicar filtro cirúrgico de contexto (top 3 chunks mais relevantes) mitigando o efeito *Lost in the Middle*.

### Passo 3: Geração Controlada & Validação Fail-Fast
- [x] Montar prompt cirúrgico injetando apenas as evidências aprovadas no contexto.
- [x] Realizar chamada à LLM local via Ollama forçando saída estruturada em JSON (`format: 'json'`).
- [x] Definir schema Zod estrito (`RagResponseSchema`) para validar a saída em tempo de execução.
- [x] Implementar barreira *fail-fast*: se a resposta for incompleta, inválida ou faltar contexto, retornar deterministicamente a flag `INSUFFICIENT_DATA`, bloqueando alucinações.

---

## 📊 Métricas e Gargalos Monitorados

- Latência da busca vetorial sob concorrência no `pgvector` (geralmente < 25ms com HNSW).
- Latência de geração do LLM local (Ollama).
- Taxa de aderência ao schema Zod vs. acionamento da flag `INSUFFICIENT_DATA`.
