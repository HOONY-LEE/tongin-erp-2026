import { Global, Module } from '@nestjs/common';
import { DocNoService } from './doc-no.service';
import { FileStoreService } from './file-store.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, FileStoreService, DocNoService],
  exports: [PrismaService, FileStoreService, DocNoService],
})
export class PrismaModule {}
