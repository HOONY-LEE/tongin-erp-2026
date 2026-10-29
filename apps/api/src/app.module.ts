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
import { MoveCatalogModule } from './modules/move-catalog/move-catalog.module';
import { AddonServiceModule } from './modules/addon-service/addon-service.module';
import { PriceConditionModule } from './modules/price-condition/price-condition.module';
import { LeadModule } from './modules/lead/lead.module';
import { EstimateModule } from './modules/estimate/estimate.module';
import { ContractModule } from './modules/contract/contract.module';
import { WorkOrderModule } from './modules/work-order/work-order.module';
import { FieldModule } from './modules/field/field.module';
import { MaterialModule } from './modules/material/material.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { BillingModule } from './modules/billing/billing.module';
import { MaterialOrderModule } from './modules/material-order/material-order.module';
import { GeoModule } from './modules/geo/geo.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { HrModule } from './modules/hr/hr.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { MenuModule } from './modules/menu/menu.module';
import { LeaveModule } from './modules/leave/leave.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PaymentConfirmationModule } from './modules/payment-confirmation/payment-confirmation.module';
import { BranchModule } from './modules/branch/branch.module';
import { AccountModule } from './modules/account/account.module';
import { AccessModule } from './modules/access/access.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StatsModule } from './modules/stats/stats.module';
import { ServiceOrderModule } from './modules/service-order/service-order.module';
import { SupportModule } from './modules/support/support.module';
import { ScopeModule } from './scope/scope.module';
import { PrincipalCacheModule } from './auth/principal-cache.service';
import { AiModule } from './ai/ai.module';
import { AgentBuilderModule } from './agent-builder/agent-builder.module';
import { EsignModule } from './modules/esign/esign.module';
import { NoticeModule } from './modules/notice/notice.module';
import { TeamTaskModule } from './modules/team-task/team-task.module';
import { InboxModule } from './inbox/inbox.module';
import { CorpAssetModule } from './modules/corp-asset/corp-asset.module';
import { BranchCaseModule } from './modules/branch-case/branch-case.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true }),
    PrismaModule,
    EventsModule,
    ScopeModule,
    PrincipalCacheModule,
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
    MoveCatalogModule,
    AddonServiceModule,
    PriceConditionModule,
    LeadModule,
    EstimateModule,
    EsignModule,
    ContractModule,
    WorkOrderModule,
    FieldModule,
    MaterialModule,
    SettlementModule,
    BillingModule,
    MaterialOrderModule,
    StatsModule,
    ServiceOrderModule,
    SupportModule,
    GeoModule,
    CalendarModule,
    CampaignModule,
    HrModule,
    ApprovalModule,
    MenuModule,
    LeaveModule,
    AttendanceModule,
    PaymentConfirmationModule,
    BranchModule,
    AccountModule,
    AccessModule,
    DashboardModule,
    AiModule,
    AgentBuilderModule,
    NoticeModule,
    TeamTaskModule,
    InboxModule,
    CorpAssetModule,
    BranchCaseModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
