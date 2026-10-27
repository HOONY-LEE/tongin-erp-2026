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
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AGENT_VISIBILITIES,
  normalizeAgentGraph,
  type AgentVisibility,
  type AuthPrincipal,
} from '@tongin/shared';
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

  /** 개인용 · 전체 공개 · 부분 공유 */
  @IsOptional()
  @IsIn(AGENT_VISIBILITIES)
  visibility?: AgentVisibility;

  /** 부분 공유 대상 직원 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  shareEmployeeIds?: string[];
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
        ? (await this.blueprints.get(dto.blueprintId, user)).graph
        : null;
    return this.generator.generate(
      dto.prompt.trim(),
      user,
      current && current.nodes.length ? current : null,
    );
  }

  /** 부분 공유로 고를 수 있는 직원(로그인 계정이 있는 재직 직원) */
  @Get('share-candidates')
  shareCandidates() {
    return this.blueprints.shareCandidates();
  }

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.blueprints.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: BlueprintDto) {
    return this.blueprints.create(dto, user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.get(id, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlueprintDto,
  ) {
    return this.blueprints.update(id, dto, user);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.duplicate(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.remove(id, user);
  }

  @Get(':id/runs')
  runs(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.runs(id, user);
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
  get(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.runner.view(id, user);
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

class CallDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  /** true면 쓰기 도구는 실행하지 않고 기록만(시험 실행) */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/**
 * AI 에이전트 화면에서 만들어 둔 에이전트 부르기 — AI 비서를 쓸 수 있으면(AI.USE) 누구나.
 * 사용중(ACTIVE)이고 내가 볼 수 있는(내 것·전체 공개·나에게 공유된) 에이전트만 부른다.
 * 도구는 부르는 사람 본인 권한으로 실행되고, 데이터를 바꾸는 도구는 승인을 거친다.
 */
@Controller('agents')
@RequirePermissions('AI.USE')
export class AgentCallController {
  constructor(
    private readonly blueprints: AgentBlueprintService,
    private readonly runner: AgentRunnerService,
  ) {}

  @Get()
  callable(@CurrentUser() user: AuthPrincipal) {
    return this.blueprints.callable(user);
  }

  @Get('runs/:runId')
  view(@CurrentUser() user: AuthPrincipal, @Param('runId', ParseUUIDPipe) runId: string) {
    return this.runner.view(runId, user);
  }

  @Post('runs/:runId/decision')
  decide(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() dto: DecisionDto,
  ) {
    return this.runner.decide(runId, dto.approve, { principal: user, authorization });
  }

  /** 이 에이전트를 내가 실행한 기록(최근 20개) */
  @Get(':id/runs')
  async runs(@CurrentUser() user: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.blueprints.assertCallable(id, user);
    return this.blueprints.myRuns(id, user);
  }

  @Post(':id/run')
  async run(
    @CurrentUser() user: AuthPrincipal,
    @Headers('authorization') authorization: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CallDto,
  ) {
    await this.blueprints.assertCallable(id, user);
    return this.runner.start(
      id,
      { input: dto.input ?? {}, dryRun: dto.dryRun ?? false, mockLlm: false },
      { principal: user, authorization },
    );
  }
}
