import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgUnitModule } from './modules/org-unit/org-unit.module';
import { CommonCodeModule } from './modules/common-code/common-code.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { CustomerModule } from './modules/customer/customer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrgUnitModule,
    CommonCodeModule,
    EmployeeModule,
    CustomerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
