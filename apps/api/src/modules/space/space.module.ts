import { Module } from '@nestjs/common';
import { SpaceController } from './space.controller';
import { SpaceService } from './space.service';

/** 공간 예약 — 회의실·대여 공간(파티룸) 예약 */
@Module({
  controllers: [SpaceController],
  providers: [SpaceService],
})
export class SpaceModule {}
