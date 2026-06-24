import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationListener } from './notification.listener';
import { StubNotificationProvider } from './notification.provider';

@Module({
  controllers: [NotificationController],
  providers: [NotificationListener, StubNotificationProvider],
})
export class NotificationsModule {}
