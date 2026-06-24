import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { AuditModule } from './audit/audit.module';
import { OrgUnitModule } from './modules/org-unit/org-unit.module';
import { CommonCodeModule } from './modules/common-code/common-code.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { CustomerModule } from './modules/customer/customer.module';
import { PartnerModule } from './modules/partner/partner.module';
import { ProductModule } from './modules/product/product.module';
import { CbmItemModule } from './modules/cbm-item/cbm-item.module';
import { AddonServiceModule } from './modules/addon-service/addon-service.module';
import { PriceConditionModule } from './modules/price-condition/price-condition.module';
import { LeadModule } from './modules/lead/lead.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    AuditModule,
    AuthModule,
    OrgUnitModule,
    CommonCodeModule,
    EmployeeModule,
    CustomerModule,
    PartnerModule,
    ProductModule,
    CbmItemModule,
    AddonServiceModule,
    PriceConditionModule,
    LeadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
