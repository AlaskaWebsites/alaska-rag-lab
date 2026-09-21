import { Controller, Post, Body, UsePipes, HttpCode, HttpStatus } from '@nestjs/common';
import { RagService } from './rag.service.js';
import { AskQuestionDtoSchema, type AskQuestionDto } from './rag.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { RagResponse } from './rag.schema.js';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(AskQuestionDtoSchema))
  async ask(@Body() dto: AskQuestionDto): Promise<RagResponse> {
    return this.ragService.ask(dto.question, { topK: dto.topK });
  }
}
