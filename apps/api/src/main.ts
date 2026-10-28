import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { koreanValidationError } from './common/validation-message';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { requestContextMiddleware } from './events/request-context';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // AI 에이전트 첨부(이미지·PDF를 base64로)가 기본 100KB를 넘는다
  app.useBodyParser('json', { limit: '30mb' });
  app.setGlobalPrefix('api');
  // 도메인 이벤트에 행위자(actorUserId)를 남기려고 요청마다 컨텍스트를 연다
  app.use(requestContextMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // 화면에 그대로 띄울 수 있게 한국어로(기본은 영어 문장)
      exceptionFactory: koreanValidationError,
    }),
  );
  // 오류 응답 모양 통일 + 상황별 한국어 안내(권한·없는 기능·외부 연동·DB …)
  app.useGlobalFilters(new AllExceptionsFilter());
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
