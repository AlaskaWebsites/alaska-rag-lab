import {
  Controller,
  Post,
  Get,
  Body,
  UsePipes,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { RagService } from '../services/rag.service.js';
import { AskQuestionDtoSchema, type AskQuestionDto } from '../dtos/rag.dto.js';
import { ZodValidationPipe } from '../../../core/common/pipes/zod-validation.pipe.js';
import { pool } from '../../../core/database/db.js';
import { redis } from '../../../core/database/redis.js';
import type { RagResponse } from '../schemas/rag.schema.js';

@Controller('rag')
export class RagController {
  private readonly ragService: RagService;

  constructor(@Optional() @Inject(RagService) ragService?: RagService) {
    this.ragService = ragService ?? new RagService();
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(AskQuestionDtoSchema))
  async ask(@Body() dto: AskQuestionDto): Promise<RagResponse> {
    return this.ragService.ask(dto.question, {
      topK: dto.topK,
      debug: dto.debug,
    });
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats() {
    const [docsRes, chunksRes, cacheKeys] = await Promise.all([
      pool.query('SELECT count(*)::int AS total FROM documents;'),
      pool.query('SELECT count(*)::int AS total FROM document_chunks;'),
      redis.smembers('semantic_cache_keys').catch(() => []),
    ]);

    return {
      status: 'UP',
      database: {
        documents: docsRes.rows[0].total,
        chunks: chunksRes.rows[0].total,
      },
      semanticCache: {
        totalCachedQueries: cacheKeys.length,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
