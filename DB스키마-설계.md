# DB 스키마 설계 (신규, 이상적 설계 — 레거시 미답습)

> 레거시(TigerSys, 부록 G)를 따라가지 않고 **처음부터 정규화·규칙 기반**으로 재설계.
> 대상 DB: PostgreSQL. 최종 수정: 2026-06-22.
> 범위: 핵심 스파인(Phase 0~1) 중심 + 확장 모듈은 §끝에 스텁.

---

## 1. 설계 컨벤션 (전 테이블 공통)

- **명명**: `snake_case`, 영문, **단수형 테이블명** (`customer`, `quote_line`).
- **PK**: `id uuid DEFAULT gen_random_uuid()` (비추측·병합 친화). 
- **업무 문서번호**: 사람이 읽는 키는 별도 컬럼 — `lead_no`, `contract_no`(UNIQUE). (레거시 recNum/contNo 역할)
- **FK**: `<대상>_id` 형식 + **반드시 FK 제약 + 인덱스**. (레거시 FK 0개 문제 해결)
- **금액**: `numeric(14,2)` (float 금지). **날짜/시각**: `date` / `timestamptz` (char(8) 금지).
- **공통 컬럼**: `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at`, `created_by uuid`, `updated_by uuid`. 필요 시 소프트삭제 `deleted_at`.
- **멀티테넌시**: 모든 트랜잭션 테이블에 `org_unit_id`(조직 귀속) — 권한·정산·통계 기준.
- **코드값**: 업무 확장형은 `common_code` 참조(역할=데이터 원칙). 고정 기술값만 enum/check.
- **상태(status)**: 각 엔티티 `status`는 `common_code`(그룹별: LEAD_STATUS 등) 값 사용 + **상태전이는 도메인 계층에서 검증**(아무 값이나 못 들어가게).
- **인덱싱**: 모든 FK 컬럼 + 업무번호(`*_no`) + `org_unit_id` + 자주 조회되는 `status`에 인덱스 필수.
- **낙관적 락**: 동시수정 충돌 방지용 `updated_at` 기반(또는 `version int`) 체크.
- **소프트삭제 정책**: 마스터(customer/product 등)는 `deleted_at` 소프트삭제, 트랜잭션(계약/오더)은 삭제 대신 `status=CANCELED`.
- **유연 속성**: 가변 항목은 `attributes jsonb`.
- **전표 불변**: 확정 거래는 수정 대신 이력(`*_history`)·이벤트. 서명 계약은 동결(E-0).
- **마이그레이션 식별자**: 이관 대상 테이블엔 `legacy_id text`(옛 PK 보존, 인덱스) 추가. 문서번호 있는 건 `*_no` 컬럼이 그 역할. 레거시 char ID는 PK로 쓰지 않고 uuid 새로 생성 + 변환표(crosswalk)로 관계 복원. (상세: 레거시-구조분석.md §4-1)

---

## 2. 조직 · 권한 · 공통코드

```sql
-- 조직: 그룹사 > 법인/브랜드 > 지점(직영/가맹) > (외부 전속업체)
CREATE TABLE org_unit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES org_unit(id),
  type        text NOT NULL,          -- GROUP | COMPANY | BRANCH | PARTNER
  code        text UNIQUE NOT NULL,   -- 레거시 beCd 대체
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  attributes  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

CREATE TABLE common_code (              -- 공통코드(룩업) — 부록 C-6
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_group  text NOT NULL,           -- 예: RECEIPT_PATH, HANDLING, CUSTOMER_GRADE
  code        text NOT NULL,
  name        text NOT NULL,
  sort_order  int DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  attributes  jsonb,
  UNIQUE (code_group, code)
);

CREATE TABLE employee (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid NOT NULL REFERENCES org_unit(id),
  emp_no      text UNIQUE,
  name        text NOT NULL,
  phone       text,
  position    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (                 -- 로그인 계정 (직원/외부인 공용)
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employee(id),   -- 직원 계정(외부인은 NULL)
  partner_id  uuid REFERENCES partner(id),    -- 외부 전속/제휴 사용자의 소속(데이터범위 스코프)
  login_id    text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  is_external boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RBAC: 역할 × 기능 × 데이터범위 × 조직 (설계노트 5장)
CREATE TABLE role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL, description text
);
CREATE TABLE permission (               -- 기능 단위: 예 ESTIMATE.READ, CONTRACT.APPROVE
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL
);
CREATE TABLE role_permission (
  role_id uuid NOT NULL REFERENCES role(id),
  permission_id uuid NOT NULL REFERENCES permission(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE user_role (                -- 데이터범위·조직 스코프 포함
  user_id uuid NOT NULL REFERENCES app_user(id),
  role_id uuid NOT NULL REFERENCES role(id),
  org_scope_id uuid REFERENCES org_unit(id),   -- 이 조직(+하위)만
  data_scope text NOT NULL DEFAULT 'OWN',       -- OWN | ORG | ALL
  PRIMARY KEY (user_id, role_id, org_scope_id)
);

CREATE TABLE partner (                  -- 거래처/제휴사/전속업체 (B2B·제휴)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,                   -- AFFILIATE(제휴) | OUTSOURCE(전속) | B2B_CLIENT
  code text UNIQUE NOT NULL, name text NOT NULL,
  attributes jsonb,
  is_active boolean NOT NULL DEFAULT true
);

-- 메뉴/화면 레지스트리 (메뉴 추가=행 추가, 코드배포·스키마변경 불필요 — 레거시 메뉴정보등록 대체)
CREATE TABLE menu (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES menu(id),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL,            -- GROUP | PAGE | ACTION
  route       text,                     -- 프론트 경로/컴포넌트 키 (커스텀오브젝트면 object code)
  permission_code text REFERENCES permission(code),  -- 이 메뉴 접근 권한
  icon        text,
  sort_order  int DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  attributes  jsonb
);
```

---

## 3. 고객 (CRM)

```sql
CREATE TABLE customer (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone_primary text,                   -- 중복탐지 키
  phone_secondary text,
  grade       text,                     -- common_code: CUSTOMER_GRADE
  status      text,                     -- common_code: CUSTOMER_STATUS
  attributes  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE INDEX ix_customer_phone ON customer(phone_primary);
-- 중복탐지: (phone_primary) / (name + 요청일) 기준 — 부록 B-2
```

---

## 4. 서비스 카탈로그 — 4개 독립 엔티티 (부록 D-2)

```sql
-- A. 판매상품(SKU): 고객이 사는 것, 견적/계약 라인에 오름
CREATE TABLE product (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL,
  name         text NOT NULL,
  service_line text NOT NULL,           -- common_code: SERVICE_LINE (이사/리빙/케어/기업이전)
  pricing_method text NOT NULL,         -- CBM | COST_PLUS | FLAT | PYEONG (레거시 calDiv 대체)
  brand_org_id uuid REFERENCES org_unit(id),  -- 상품소속(브랜드)
  is_active    boolean NOT NULL DEFAULT true,
  attributes   jsonb
);

-- B. CBM 품목사전: 짐량 측정용 표준 사전 (파는 게 아님)
CREATE TABLE cbm_item (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category  text NOT NULL,              -- [책상][의자류][금고]… common_code: ITEM_CATEGORY
  name      text NOT NULL,
  cbm       numeric(8,2) NOT NULL,      -- 부피
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (category, name)               -- 중복 생성 방지(거버넌스)
);

-- C. 옵션/부가서비스: 애드온 (분해설치·사다리차·보관…)
CREATE TABLE addon_service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, name text NOT NULL,
  unit text NOT NULL,                   -- EA | 정액
  price numeric(14,2),
  is_active boolean NOT NULL DEFAULT true
);

-- D. 가격조건(제휴/프로모션): 상품 아님 → 거래처 + 조건 오버레이
CREATE TABLE price_condition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid REFERENCES partner(id),     -- 제휴사 연결 (NULL=전사 프로모션)
  name        text NOT NULL,                   -- 예: LG유플러스 10%
  discount_type text NOT NULL,                 -- RATE | AMOUNT | FIXED_PRICE
  discount_value numeric(14,2) NOT NULL,
  valid_from  date, valid_to date,
  conditions  jsonb,                           -- 적용조건(상품·결제수단 등)
  is_active   boolean NOT NULL DEFAULT true
);
```

---

## 5. 리드 / 접수

```sql
CREATE TABLE lead (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_no       text UNIQUE NOT NULL,          -- 접수번호(R…)
  customer_id   uuid REFERENCES customer(id),
  org_unit_id   uuid NOT NULL REFERENCES org_unit(id),  -- 담당 지점
  owner_emp_id  uuid REFERENCES employee(id),
  partner_id    uuid REFERENCES partner(id),    -- 제휴/전속 출처 귀속(정산·통계)
  source        text,                          -- common_code: RECEIPT_PATH (recPath)
  service_line  text,                          -- 이사/리빙/케어
  status        text NOT NULL,                 -- 상태머신(부록 D-4): RECEIVED→CONSULT_TOSS→…
  from_zipcode text, from_addr text, from_lat numeric(10,7), from_lng numeric(10,7),
  to_zipcode text, to_addr text,
  move_date    date,
  visit_date   date,                           -- 견적사원 방문 예정
  expected_amount numeric(14,2),               -- expTossAmt
  attributes   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);
```

---

## 6. 견적 (부록 E·F) — 헤더 + 구역 + 라인 + 부가 + 원가

```sql
CREATE TABLE estimate (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_no  text UNIQUE NOT NULL,
  lead_id      uuid NOT NULL REFERENCES lead(id),
  customer_id  uuid NOT NULL REFERENCES customer(id),
  org_unit_id  uuid NOT NULL REFERENCES org_unit(id),
  product_id   uuid NOT NULL REFERENCES product(id),   -- 이사종류
  estimator_emp_id uuid REFERENCES employee(id),
  from_addr text, from_pyeong int, from_elevator boolean,
  to_addr   text, to_pyeong int, to_elevator boolean,
  total_cbm    numeric(10,2),                  -- 라인 합산
  base_amount  numeric(14,2),                  -- 기본 운임/산정가
  total_amount numeric(14,2),                  -- 최종가
  work_instructions text,                      -- 작업지시 메모(현장팀용)
  status       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE estimate_zone (                   -- 구역(유연): 안방/거실/사무실…
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
  name text NOT NULL, sort_order int DEFAULT 0
);

CREATE TABLE estimate_line (                   -- 품목 라인
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
  zone_id     uuid REFERENCES estimate_zone(id),
  cbm_item_id uuid REFERENCES cbm_item(id),    -- 품목사전 참조 (FK!)
  qty         numeric(8,2) NOT NULL DEFAULT 1,
  cbm         numeric(8,2),
  handling    text,                            -- common_code: HANDLING (운반/방치/폐기)
  memo        text
);

CREATE TABLE estimate_addon (                  -- 부가서비스/옵션 선택
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES addon_service(id),
  qty numeric(8,2) DEFAULT 1, amount numeric(14,2)
);

CREATE TABLE estimate_applied_condition (      -- 적용된 가격조건(제휴·할인) 이력
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
  price_condition_id uuid REFERENCES price_condition(id),
  applied_amount numeric(14,2)
);

CREATE TABLE estimate_cost_line (              -- B2B 원가적상식(산출내역서, 부록 F-3)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES estimate(id) ON DELETE CASCADE,
  cost_type text NOT NULL,                     -- MATERIAL | VEHICLE | LABOR | ETC
  name text, unit text, qty numeric(10,2), unit_price numeric(14,2), amount numeric(14,2),
  material_item_id uuid REFERENCES product(id) -- 재료비↔자재 연동 hook (부록 F-4)
);
```

---

## 7. 계약 · 결제

```sql
CREATE TABLE contract (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no  text UNIQUE NOT NULL,           -- CT…
  estimate_id  uuid NOT NULL REFERENCES estimate(id),
  customer_id  uuid NOT NULL REFERENCES customer(id),
  org_unit_id  uuid NOT NULL REFERENCES org_unit(id),
  contract_date date,
  total_amount numeric(14,2) NOT NULL,
  deposit_amount numeric(14,2),                -- 계약금
  deposit_ratio numeric(5,2),                  -- 비율(설정값, 고정 아님)
  balance_amount numeric(14,2),                -- 잔금
  status       text NOT NULL,
  snapshot     jsonb,                          -- 서명 시점 동결 데이터(E-0)
  signed_at    timestamptz,
  esign_ref    text,                           -- 전자계약 업체 참조
  created_at   timestamptz NOT NULL DEFAULT now()
  -- ⚠️ 카드정보 컬럼 없음(의도적). 결제는 토스페이먼츠 위임.
);

CREATE TABLE payment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contract(id),
  kind        text NOT NULL,                   -- DEPOSIT(계약금) | BALANCE(잔금)
  method      text,                            -- VIRTUAL_ACCOUNT | CARD | TRANSFER | CASH
  amount      numeric(14,2) NOT NULL,
  status      text NOT NULL,                   -- PENDING | PAID | CANCELED
  pg_provider text DEFAULT 'TOSS',
  pg_ref      text,                            -- 토스 거래/가상계좌 참조
  virtual_account text,
  paid_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

---

## 8. 작업 (서비스 오더)

```sql
CREATE TABLE work_order (                       -- 작업토스로 계약→오더 전환
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_no     text UNIQUE NOT NULL,
  contract_id uuid NOT NULL REFERENCES contract(id),
  org_unit_id uuid NOT NULL REFERENCES org_unit(id),  -- 작업 수행 지점
  partner_id  uuid REFERENCES partner(id),     -- 전속 외주 시
  scheduled_date date,
  status      text NOT NULL,                   -- ASSIGNED→IN_PROGRESS→DONE
  billed_cost numeric(14,2),                   -- 전속 청구비용(원가) — 마진 추적(D-3)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_assignment (                  -- 인력/차량 배정(스케줄링)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id),
  employee_id uuid REFERENCES employee(id),
  resource_type text,                           -- CREW | VEHICLE
  resource_ref text,
  scheduled_at timestamptz
);
```

---

## 9. 횡단 — 이벤트 · 감사 · 문서

```sql
CREATE TABLE domain_event (                     -- outbox (이벤트 기반, 설계노트 1-A)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  event_type text NOT NULL, payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE TABLE audit_log (                        -- 전표 원칙(변경이력)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  action text NOT NULL, before jsonb, after jsonb,
  actor_user_id uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document (                         -- 동결 문서(서명계약 등). 일반문서는 동적생성·무저장
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL, ref_type text, ref_id uuid,
  storage_url text, hash text, frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 10. 추후 모듈 (스텁 — Phase 2~3에서 상세 설계)

- **자재·재고(MM)**: `material`, `purchase_order`, `goods_receipt`, `goods_issue`, `stock`, `stock_closing` — `estimate_cost_line.material_item_id`와 연동(F-4).
- **정산(Settlement)**: `settlement`, `settlement_line`, `commission_rule`, `invoice`(전속/B2B 청구), `receivable`(미수금).
- **AS·CS**: `as_request`, `as_process`, `happy_call`.
- **HR(가벼운)**: `incentive`, `penalty`, `branch_appraisal` (급여·세무는 외부 연동).
- **마케팅/AI**: `campaign`, `segment`, 이벤트 기반 hook.

---

## 11. 핵심 관계 한눈에 (FK 흐름)

```
org_unit ─┬─ employee ─ app_user ─ user_role ─ role ─ role_permission ─ permission
          └─ (모든 트랜잭션의 org_unit_id)
customer ─ lead ─ estimate ─ contract ─ payment
                    │            └─ work_order ─ work_assignment
                    ├─ estimate_zone ─ estimate_line ─ cbm_item
                    ├─ estimate_addon ─ addon_service
                    ├─ estimate_applied_condition ─ price_condition ─ partner
                    └─ estimate_cost_line ─(material)→ product
product / cbm_item / addon_service / price_condition  = 카탈로그 4엔티티
```

---

## 12. 확장성: 스키마 변경 없이 기능/메뉴 추가

### 12-1. 메뉴는 데이터 (§2 `menu`)
새 메뉴 추가·이동·숨김 = `menu` 행 추가/수정. **코드배포·스키마변경 불필요.** `permission_code`로 노출 권한 제어.

### 12-2. 커스텀 오브젝트 (세일즈포스식) — 명함관리 같은 신규 기능을 DDL 없이
```sql
CREATE TABLE custom_object (            -- 새 "개체" 정의 (예: 명함, 비품대여)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,            -- business_card
  name text NOT NULL,                   -- 명함관리
  org_scoped boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE custom_field (             -- 개체의 필드 정의
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES custom_object(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL,
  data_type text NOT NULL,             -- TEXT|NUMBER|DATE|BOOL|SELECT|FILE|REF
  required boolean DEFAULT false, sort_order int DEFAULT 0,
  options jsonb,                       -- SELECT 보기 / REF 대상 등
  UNIQUE (object_id, code)
);
CREATE TABLE custom_record (           -- 실제 데이터 (jsonb)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES custom_object(id),
  org_unit_id uuid REFERENCES org_unit(id),
  data jsonb NOT NULL,                 -- {"이름":..,"회사":..,"직책":..,"전화":..}
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_at timestamptz
);
CREATE INDEX ix_custom_record_obj ON custom_record(object_id);
CREATE INDEX ix_custom_record_data ON custom_record USING gin (data);
```
- **흐름(예: 명함관리)**: 관리자가 `custom_object('business_card','명함관리')` 생성 → `custom_field`로 이름·회사·직책·전화·이미지 추가 → 공용 화면이 자동 렌더 → `menu` 행 추가로 노출. **스키마 변경 0, 배포 0.**
- **적합**: 명함·비품대여·간단 대장류 등 가벼운 부가 기능.
- **부적합(=정규 테이블로)**: 핵심 트랜잭션, 복잡 관계, 대용량/고성능, 정산 연동 → 정식 마이그레이션(스키마 추가). ← 이게 건강한 방식. 모든 걸 jsonb로 욱여넣는 EAV 안티패턴은 지양.

## 13. 구조 검토 결과 & 안정성

**판정: ERP 코어로 구조적으로 안정적** — 정규화, FK 무결성 강제, 전표/감사, 이벤트, 멀티테넌시 모두 충족.

**검토 중 반영한 개선:**
- 메뉴 레지스트리(`menu`), 커스텀 오브젝트(`custom_*`) — 무스키마 확장.
- `app_user.partner_id`(외부 사용자 소속), `lead.partner_id`(제휴 귀속).
- status→common_code + 도메인 상태전이 검증, 인덱싱/낙관적락/소프트삭제 정책(§1).

**구현 단계에서 점검할 항목:**
- [ ] 모든 FK 컬럼 인덱스 일괄 생성
- [ ] 채번 서비스(lead_no/contract_no 생성, 레거시 충돌 방지)
- [ ] customer 조직범위 정책 확정(전사 공유 마스터 + 담당조직은 lead/contract에 귀속)
- [ ] estimate→contract 확정 후 estimate 잠금(불변)
- [ ] estimate_line 라인별 단가/금액 필요 상품군(옵션) 검토
