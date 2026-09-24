import {
  Controller,
  Post,
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
}
