import { Module } from '@nestjs/common';
import { RagController } from './controllers/rag.controller.js';
import { RagService } from './services/rag.service.js';
import { AiEngineModule } from '../ai-engine/ai-engine.module.js';

@Module({
  imports: [AiEngineModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
