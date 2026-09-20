# Documento de Conhecimento Técnico: Ecossistema Alaska Local

## 1. Visão Geral e Proposta de Valor
O Alaska Local é uma plataforma multi-tenant criada para empoderar micro, pequenas e médias empresas locais (como restaurantes, bares, lojas de conveniência e salões de beleza). A proposta central é transformar o tráfego orgânico local e as interações cotidianas em conversões diretas pelo WhatsApp, eliminando as taxas exorbitantes cobradas por marketplaces de delivery tradicionais.

O ecossistema divide-se em quatro pilares integrados:
1. **Alaska Menu**: Cardápio digital de alta velocidade otimizado para celulares e pedidos via WhatsApp.
2. **Alaska Shop**: Catálogo e vitrine de produtos físicos para comércios de varejo e bairro.
3. **Alaska Hub**: Gestor centralizado de catálogo, pedidos, estoque e integrações de pagamentos.
4. **Alaska Pro**: Módulo para prestadores de serviços com agendamento online de horários e atendimento.

## 2. Padrões de Arquitetura de Software
O backend adota os princípios rígidos de Clean Architecture e DDD (Domain-Driven Design). Cada módulo opera através de Portas e Adaptadores (Hexagonal Architecture), desacoplando totalmente o domínio de regras de negócio de frameworks, bancos de dados e interfaces externas.

Principais decisões técnicas consolidadas:
- **NestJS e TypeScript**: Injeção de dependências, modularidade e tipagem estrita de ponta a ponta.
- **Value Objects para Moeda**: Preços e taxas são obrigatoriamente armazenados e calculados em centavos inteiros (Integer Money VO), evitando qualquer anomalia de precisão de ponto flutuante.
- **Validação com Zod**: Todos os contratos de entrada e saída são blindados com esquemas Zod (ZodValidationPipe), aplicando o princípio de fail-fast.
- **Isolamento de Dados com PostgreSQL RLS**: Cada tenant possui suas linhas isoladas nativamente no nível do banco através de Row-Level Security, garantindo segurança estrita em ambiente multi-inquilino.
- **Workers Assíncronos com BullMQ e Redis**: Operações de longa duração, como envio de notificações em lote e ingestão de documentos vetoriais, rodam em background desacopladas do event loop HTTP.

## 3. Diretrizes de Inferência e RAG
Para aplicações com Inteligência Artificial, o ecossistema rejeita prompts estáticos descontrolados. Toda resposta contextualizada deve passar por:
1. Busca vetorial preliminar com pgvector utilizando distância de cosseno (`<=>`).
2. Reranking cirúrgico para selecionar os top 3 a 5 fragmentos mais informativos, mitigando a armadilha do Lost in the Middle.
3. Validação do retorno da LLM contra um schema Zod fechado (`strict: true`). Caso os fragmentos recuperados não contenham evidências suficientes, a aplicação emite a flag estruturada `INSUFFICIENT_DATA`.
