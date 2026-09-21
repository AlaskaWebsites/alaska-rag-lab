import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3000;

  await app.listen(port);
  console.log(`\n🚀 Servidor NestJS ativo!`);
  console.log(`🌐 Endpoint RAG disponível em: http://localhost:${port}/rag/ask\n`);
}

bootstrap().catch((err) => {
  console.error('Erro ao iniciar aplicação NestJS:', err);
  process.exit(1);
});
