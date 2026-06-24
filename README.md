# 통인익스프레스 차세대 ERP

100년 전통 통인익스프레스의 레거시(MSSQL + 마이빌더) 대체 프로젝트.
**세일즈포스(앞단: CRM·견적) + SAP(뒷단: 운영·전표·통합)** 철학을 녹인 한국형 ERP.

---

## 🧭 새 세션은 여기부터 읽으세요 (Start Here)

1. **이 README** — 프로젝트 개요 + 문서 지도 + 현재 상태
2. [통인익스프레스-ERP-설계노트.md](통인익스프레스-ERP-설계노트.md) — **도메인 지식의 원천** (왜·무엇을). 부록 A~F 포함
3. [기술스택-및-아키텍처.md](기술스택-및-아키텍처.md) — 무엇으로 만드는가
4. [개발원칙-및-브랜치전략.md](개발원칙-및-브랜치전략.md) — **코드 작성 전 필독** (어떻게 협업하는가)
5. [기능목록-및-로드맵.md](기능목록-및-로드맵.md) — **무슨 일을 할지 + 진행상태** (충돌 방지의 핵심)

---

## 문서 지도

| 문서 | 역할 | 갱신 빈도 |
|------|------|-----------|
| README.md | 인덱스·상태 스냅샷 | 가끔 |
| 설계노트 | 도메인 모델·결정·근거 (살아있는 문서) | 자주 |
| 기술스택-및-아키텍처 | 스택·구조 결정 | 드물게(확정 후 고정) |
| 개발원칙-및-브랜치전략 | 협업 규칙 | 드물게 |
| 기능목록-및-로드맵 | 백로그·우선순위·상태 | **매 작업마다** |
| DB스키마-설계 | 신규 PostgreSQL 스키마(이상적 재설계) | 구현 전 확정 |
| 레거시-구조분석 | 레거시 DB 분류·매핑·마이그레이션 규칙 | 마이그레이션 시 |
| legacy-schema.sql / legacy-inventory.csv | 레거시 원본 덤프(구조만) | 고정 |

---

## 현재 상태 스냅샷 (2026-06-24)

- **단계: Phase 0 구현 진행 중** (설계는 사실상 완료)
- **설계 완료**: 도메인 모델, 핵심 프로세스(접수→완료 상태머신), 서비스 카탈로그(3축/4엔티티), 견적·계약·문서 모델(가정 CBM / 기업 원가적상식), 결제 자동화·OCR 방침, 전체 아키텍처, 권한 모델
- **기술 스택 확정**: NestJS(TS) / PostgreSQL / React+AntD(반응형 웹 우선→네이티브 RN) / AWS 서울 / 모노레포 / GitHub Flow
- **구현 완료(Phase 0)**: FND-01(모노레포)·02(DB)·03(인증·RBAC·에이전트주체)·04(조직)·05(공통코드)·06(직원)·08(고객) — 전부 인증 포함 end-to-end 검증
- **AI 개방 계층(AX) 설계**: 에이전트=RBAC 1급 주체 + 이벤트 디스패치 + 선언적 워크플로우 ([설계노트 1-B](통인익스프레스-ERP-설계노트.md)). 구현은 P2~3(AIX/AUTO).
- **다음 액션**: FND-09(상품 4엔티티 — 마이그레이션 필요)·FND-07(이벤트/감사) → Phase 1(MVP: 리드→견적→계약→작업)
- **로그인(개발)**: `admin` / `admin1234` (⚠️ `ADMIN_PASSWORD` env로 변경)

### 모노레포 구조
```
apps/api      NestJS + Prisma (백엔드, API-first)
apps/web      React + Vite + Ant Design (반응형 웹)
packages/shared  공유 타입/상수 (@tongin/shared)
```
실행: `pnpm install` → `pnpm --filter @tongin/api exec prisma generate` → `pnpm dev` (turbo). 빌드: `pnpm build`.

### 다른 컴퓨터에서 시작하기 (집/회사 동기화)

사전 준비: **Node 20+**, **pnpm 10**(`corepack enable`), **Docker Desktop**, **git**.

```bash
# 1. 클론
git clone https://github.com/HOONY-LEE/tongin-erp-2026.git
cd tongin-erp-2026

# 2. 의존성 설치
corepack enable
pnpm install

# 3. 환경변수 (apps/api/.env 는 git에 없음 → 예시에서 복사)
cp apps/api/.env.example apps/api/.env

# 4. 로컬 DB 기동 (PostgreSQL, 호스트 5433)
docker compose up -d

# 5. DB 스키마 적용 + Prisma 클라이언트 생성
pnpm --filter @tongin/api exec prisma migrate deploy
pnpm --filter @tongin/api exec prisma generate

# 6. 개발 서버 (API 3001 + 웹 3000)
pnpm dev
```

확인: 웹 http://localhost:3000 · API http://localhost:3001/api/health/db

> 작업 흐름: 시작 전 `git pull` → **`pnpm install && pnpm build`**(공유패키지 dist·새 의존성 반영) → 마이그레이션 있으면 `prisma migrate deploy` → 기능 브랜치 → PR → 머지(GitHub Flow). 상세는 개발원칙 문서.
> ⚠️ DB 데이터는 각 컴퓨터의 로컬 docker라 공유되지 않음(스키마만 마이그레이션으로 동일). 운영 공용 DB는 추후 클라우드(FND-02 클라우드 파트).

---

## ⚠️ 멀티 세션 충돌 방지 규칙 (요약)

1. 모든 작업 = [기능목록](기능목록-및-로드맵.md)의 **항목(ID)**. 시작 전 그 문서의 "진행중 현황"에 등록.
2. **1 기능 = 1 브랜치 = 1 PR** (브랜치명 = 기능ID).
3. 모듈 경계 안에서 작업 (모듈러 모놀리식) → 파일 충돌 최소화.
4. 상세 규칙은 [개발원칙-및-브랜치전략.md](개발원칙-및-브랜치전략.md).
