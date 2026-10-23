import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeAgentGraph, type AuthPrincipal } from '@tongin/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AgentBlueprintService } from './agent-blueprint.service';
import { AgentGeneratorService } from './agent-generator.service';
import { AgentRunnerService } from './agent-runner.service';

class BlueprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE'])
  status?: 'DRAFT' | 'ACTIVE';

  /** { version, nodes, edges } — 서버가 정리(normalize)해서 저장한다 */
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;
}

class GenerateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  prompt!: string;

  /** 있으면 이 블루프린트를 고친다(자연어로 수정하기) */
  @IsOptional()
  @IsUUID()
  blueprintId?: string;

  /** 편집 중인(저장 전) 그래프 — 있으면 저장본 대신 이것을 고친다 */
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown>;
}

class ValidateDto {
  @IsObject()
  graph!: Record<string, unknown>;
}

class RunDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  /** 기본 true — 쓰기 도구는 실제로 실행하지 않고 기록만 */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** true면 AI 판단 노드를 실제로 부르지 않고 예시 응답으로(비용 없이 흐름만 확인) */
  @IsOptional()
  @IsBoolean()
  mockLlm?: boolean;

  /** 편집 중인(저장 전) 그래프로 실행 */
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown>;
}

class DecisionDto {
  @IsBoolean()
  approve!: boolean;
}

/**
 * AIX-04: AI 에이전트 관리 — 블루프린트 CRUD, 도구 탐색, 검증, 자연어 생성·수정, 테스트 실행.
 * 도구는 AI 비서와 같은 레지스트리(ERP API 카탈로그 + 업무 도구)를 실행자 본인 권한으로 쓴다.
 */
@Controller('agent-blueprints')
@RequirePermissions('AI.MANAGE')
export class AgentBlueprintController {
  constructor(
    private readonly blueprints: AgentBlueprintService,
    private readonly generator: AgentGeneratorService,
    private readonly runner: AgentRunnerService,
  ) {}

  @Get('status')
  status() {
    return { aiConfigured: this.generator.configured };
  }

  /** 노드로 부를 수 있는 도구 전체(이 사용자 권한 기준) */
  @Get('tools')
  tools(@CurrentUser() user: AuthPrincipal) {
    return this.blueprints.toolInfos(user);
  }

  @Post('validate')
  validate(@CurrentUser() user: AuthPrincipal, @Body() dto: ValidateDto) {
    return this.blueprints.validate(normalizeAgentGraph(dto.graph), user);
  }

  @Post('generate')
  async generate(@CurrentUser() user: AuthPrincipal, @Body() dto: GenerateDto) {
    const current = dto.graph
      ? normalizeAgentGraph(dto.graph)
      : dto.blueprintId
        ? (await this.blueprints.get(dto.blueprintId)).graph
        : null;
    return this.generator.generate(
      dto.prompt.trim(),
      user,
      current && current.nodes.length ? current : null,
    );
  }

  @Get()
  list() {
    return this.blueprints.list();
  }

  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: BlueprintDto) {
    return this.blueprints.create(dto, user.userId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BlueprintDto) {
    return this.blueprints.update(id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.duplicate(id, user.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.remove(id);
  }

  @Get(':id/runs')
  runs(@Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.runs(id);
  }

  @Post(':id/run')
  run(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunDto,
  ) {
    return this.runner.start(
      id,
      {
        input: dto.input ?? {},
        dryRun: dto.dryRun ?? true,
        mockLlm: dto.mockLlm ?? false,
        graph: dto.graph,
      },
      { principal: user, authorization },
    );
  }
}

/** 승인 대기 중인 실행 — 승인·거절 후 이어서 실행 */
@Controller('agent-runs')
@RequirePermissions('AI.MANAGE')
export class AgentRunController {
  constructor(private readonly runner: AgentRunnerService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.runner.view(id);
  }

  @Post(':id/decision')
  decide(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.runner.decide(id, dto.approve, { principal: user, authorization });
  }
}
