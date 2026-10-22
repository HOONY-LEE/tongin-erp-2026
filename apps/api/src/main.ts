import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // AI 에이전트 첨부(이미지·PDF를 base64로)가 기본 100KB를 넘는다
  app.useBodyParser('json', { limit: '30mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // 웹이 다른 도메인에 있을 때만 필요. 같은 도메인에서 /api 로 프록시하면 비워 두면 된다.
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });

  const port = Number(process.env.PORT ?? 3001);
  // 컨테이너에서는 0.0.0.0 으로 바인딩해야 외부에서 접근된다
  await app.listen(port, '0.0.0.0');
  console.log(`[tongin-api] listening on :${port}/api`);
}

void bootstrap();
