import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import { raw, type NextFunction, type Request, type Response } from 'express';
import { DRIVE_FILE_MAX_BYTES } from '@tongin/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { koreanValidationError } from './common/validation-message';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { requestContextMiddleware } from './events/request-context';
import { SystemLogger } from './system-log/system-logger';

async function bootstrap() {
  // 부팅 중 로그도 놓치지 않게 모아 두었다가 시스템 로거로 넘긴다(경고·오류는 DB 시스템 로그에도)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(new SystemLogger());
  // 보안 헤더 — 서버 종류를 알리지 않고, 남의 사이트가 화면을 iframe에 넣어 누르게 하거나(클릭재킹)
  // 파일 종류를 추측해 HTML로 실행하는(MIME 스니핑) 일을 막는다. 주소(서명 링크 토큰)는 다른 사이트로 넘기지 않는다
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });
  // AI 에이전트 첨부(이미지·PDF를 base64로)가 기본 100KB를 넘는다
  app.useBodyParser('json', { limit: '30mb' });
  // 응답 압축(gzip) — 목록 JSON이 3~5배 작아진다. 1KB 미만은 그대로 보낸다(compression 기본값)
  app.use(compression());
  // 드라이브 파일 올리기 — 본문을 바이트 그대로(이름은 헤더). 다른 요청은 JSON만
  app.use('/api/drive/upload', raw({ type: () => true, limit: DRIVE_FILE_MAX_BYTES + 1024 }));
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
