import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { KNOWLEDGE_CATEGORIES, type AuthPrincipal } from '@tongin/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';

class KnowledgeDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsIn(KNOWLEDGE_CATEGORIES) category?: string;
  @IsOptional() @IsString() @MaxLength(400_000) content?: string;
}

class UploadDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  /** base64 — 15MB 파일이면 약 20MB 글자 */
  @IsString() @MaxLength(21_000_000) dataBase64!: string;
  @IsOptional() @IsIn(KNOWLEDGE_CATEGORIES) category?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}

/**
 * 지식베이스 — 회사 문서·지침·원칙. 보기는 로그인한 누구나, 올리기·고치기·지우기는 KNOWLEDGE.* 권한(서비스에서 확인).
 * AI 도구는 search_knowledge · read_knowledge(AI 업무 도구)로 따로 열려 있다.
 */
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('docs')
  list() {
    return this.knowledge.list();
  }

  @Get('graph')
  graph() {
    return this.knowledge.graph();
  }

  @Get('search')
  search(@Query('q') q = '') {
    return this.knowledge.search(q, 10);
  }

  @Get('concepts/:id')
  concept(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.concept(id);
  }

  @Get('docs/:id')
  one(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.one(id, user);
  }

  @Post('docs')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: KnowledgeDto) {
    return this.knowledge.create(user, dto);
  }

  @Post('docs/upload')
  upload(@CurrentUser() user: AuthPrincipal, @Body() dto: UploadDto) {
    return this.knowledge.upload(user, dto);
  }

  @Patch('docs/:id')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeDto,
  ) {
    return this.knowledge.update(user, id, dto);
  }

  @Post('docs/:id/analyze')
  analyze(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.reanalyze(user, id);
  }

  @Delete('docs/:id')
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.remove(user, id);
  }
}
