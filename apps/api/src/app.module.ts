import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
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
import { EstimateModule } from './modules/estimate/estimate.module';
import { ContractModule } from './modules/contract/contract.module';
import { WorkOrderModule } from './modules/work-order/work-order.module';
import { MaterialModule } from './modules/material/material.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true }),
    PrismaModule,
    EventsModule,
    AuditModule,
    NotificationsModule,
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
    EstimateModule,
    ContractModule,
    WorkOrderModule,
    MaterialModule,
    SettlementModule,
    BillingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
