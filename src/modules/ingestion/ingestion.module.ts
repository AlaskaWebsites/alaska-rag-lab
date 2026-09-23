import { Module } from '@nestjs/common';
import { AiEngineModule } from '../ai-engine/ai-engine.module.js';

@Module({
  imports: [AiEngineModule],
})
export class IngestionModule {}
