import { Module } from '@nestjs/common';
import { OllamaService } from './providers/ollama.service.js';

@Module({
  providers: [OllamaService],
  exports: [OllamaService],
})
export class AiEngineModule {}
