import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AgentBlueprintController, AgentRunController } from './agent-blueprint.controller';
import { AgentBlueprintService } from './agent-blueprint.service';
import { AgentGeneratorService } from './agent-generator.service';
import { AgentRunnerService } from './agent-runner.service';

/** AIX-04: AI 에이전트 관리 — 노드 블루프린트 빌더(자연어 생성·직접 편집·테스트 실행) */
@Module({
  imports: [AiModule],
  controllers: [AgentBlueprintController, AgentRunController],
  providers: [AgentBlueprintService, AgentGeneratorService, AgentRunnerService],
})
export class AgentBuilderModule {}
