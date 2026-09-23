import { Module } from '@nestjs/common';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { RagModule } from './modules/rag/rag.module.js';

@Module({
  imports: [AiEngineModule, IngestionModule, RagModule],
})
export class AppModule {}
