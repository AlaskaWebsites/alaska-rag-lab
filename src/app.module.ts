import { Module } from '@nestjs/common';
import { RagModule } from './rag/rag.module.js';

@Module({
  imports: [RagModule],
})
export class AppModule {}
