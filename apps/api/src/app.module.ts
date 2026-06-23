import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { OrgUnitModule } from './modules/org-unit/org-unit.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, OrgUnitModule],
  controllers: [AppController],
})
export class AppModule {}
