import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { CustomerHistoryService } from './customer-history.service';

@Module({
  controllers: [CustomerController],
  providers: [CustomerService, CustomerHistoryService],
})
export class CustomerModule {}
