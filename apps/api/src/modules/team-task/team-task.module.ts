import { Module } from '@nestjs/common';
import { TeamTaskController } from './team-task.controller';
import { TeamTaskService } from './team-task.service';

@Module({
  controllers: [TeamTaskController],
  providers: [TeamTaskService],
})
export class TeamTaskModule {}
