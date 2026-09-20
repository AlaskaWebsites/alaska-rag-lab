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
- **LLM & Embeddings Locais**: Ollama (`nomic-embed-text` para embeddings e `llama3` / `phi3` para inferência)
- **Contratos & Validação**: Zod (Structured Outputs e Fail-Fast)

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos (Ollama)
Certifique-se de ter o Ollama instalado e baixe o modelo de embeddings:
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

### 3. Instalar Dependências
```bash
npm install
```

### 4. Executar Testes Unitários do Chunker
```bash
npm test
```

### 5. Executar a Esteira de Ingestão Assíncrona (Passo 1)
Abra dois terminais na raiz do projeto:

**Terminal 1 (Worker BullMQ)**:
```bash
npm run worker
```

**Terminal 2 (Disparo do Job de Ingestão)**:
```bash
npm run ingest
```

O worker lerá o arquivo `data/sample-knowledge.md`, fará o chunking semântico, chamará o Ollama local para gerar os embeddings (768 dimensões) e salvará tudo de forma transacional no `pgvector` com índice **HNSW**.

---

## 📋 Roteiro de Implementação

### Passo 1: Esteira de Ingestão de Conhecimento (Offline / Worker)
- [x] Subir container Docker com PostgreSQL e extensão `pgvector`.
- [x] Configurar tabela para armazenar chunks, embeddings e metadados contextuais (documento, página, autor).
- [x] Desenvolver script/worker com BullMQ para leitura de arquivos Markdown/docs.
- [x] Implementar chunking semântico equilibrado (~300 a 400 tokens por fragmento).
- [x] Gerar embeddings locais via Ollama (`nomic-embed-text`) e persistir com integridade transacional.

### Passo 2: Pipeline de Inferência em Tempo Real (Busca & Reranking)
- [ ] Criar endpoint HTTP no NestJS para receber perguntas do usuário.
- [ ] Vetorizar a consulta recebida em tempo real utilizando o mesmo modelo de embeddings da ingestão.
- [ ] Executar busca vetorial por distância de cosseno no `pgvector` recuperando uma lista ampla de candidatos preliminares (top 50 a 100).
- [ ] Aplicar filtro/reranking cirúrgico para selecionar apenas o top 3 a 5 chunks mais relevantes, eliminando ruído e o efeito *Lost in the Middle*.

### Passo 3: Geração Controlada & Validação Fail-Fast
- [ ] Montar prompt cirúrgico injetando apenas as evidências aprovadas no top 3-5.
- [ ] Realizar chamada à LLM local via Ollama aplicando restrição gramatical/estruturada (`strict: true`).
- [ ] Definir schema Zod estrito para o payload de resposta.
- [ ] Implementar barreira *fail-fast*: se a resposta for inválida, incompleta ou fora do schema, retornar a flag controlada `INSUFFICIENT_DATA`, impedindo alucinações na ponta.

---

## 📊 Métricas e Gargalos a Monitorar

- Latência da busca vetorial sob concorrência no `pgvector`.
- Sobrecarga e tempo de resposta da etapa de reranking.
- Taxa de aderência ao schema Zod vs. acionamento da flag `INSUFFICIENT_DATA`.
