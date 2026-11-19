import { Global, Module } from '@nestjs/common';
import { FileStoreService } from './file-store.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, FileStoreService],
  exports: [PrismaService, FileStoreService],
})
export class PrismaModule {}
