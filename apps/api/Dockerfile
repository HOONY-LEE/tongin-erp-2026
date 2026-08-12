# 통인 ERP API — pnpm 워크스페이스 + Prisma 프로덕션 이미지
# 빌드: 저장소 루트에서  docker build -f apps/api/Dockerfile -t tongin-api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ── 의존성 ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── 빌드 ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm --filter @tongin/shared build \
  && pnpm --filter @tongin/api exec prisma generate \
  && pnpm --filter @tongin/api exec nest build

# ── 실행 ──
FROM base AS runner
ENV NODE_ENV=production
# 마이그레이션(prisma migrate deploy)을 컨테이너 시작 시 돌리므로 prisma CLI가 필요하다
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/package.json ./

WORKDIR /app/apps/api
EXPOSE 3001
# 배포마다 스키마를 맞춘 뒤 기동 — 마이그레이션 실패 시 기동하지 않는다(부분 적용 방지)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
