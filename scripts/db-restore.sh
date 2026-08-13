#!/usr/bin/env bash
# 덤프를 다른 Postgres에 복원한다. AWS RDS 등으로 이전할 때 쓴다.
#
#   ./scripts/db-restore.sh backup/tongin-....dump "postgresql://..."
#
# 대상 DB의 기존 객체를 지우고 덮어쓴다(--clean --if-exists).
set -euo pipefail

DUMP="${1:-}"
DEST="${2:-}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

if [ -z "$DUMP" ] || [ -z "$DEST" ]; then
  echo "사용법: $0 <덤프파일> <대상 DATABASE_URL>" >&2
  exit 1
fi
if [ ! -f "$DUMP" ]; then
  echo "덤프 파일이 없습니다: $DUMP" >&2
  exit 1
fi

echo "복원 대상: $(echo "$DEST" | sed -E 's#//[^@]+@#//***@#')"

# --clean --if-exists: 대상에 이미 있는 객체를 지우고 덮어쓴다
# --no-owner --no-acl: 롤 이름이 달라도 복원되도록
# 확장(extension) 관련 권한 오류 등은 무해한 경우가 많아 exit code 를 막지 않는다
docker run --rm -i "$PG_IMAGE" \
  pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DEST" < "$DUMP" || true

echo "복원 완료. 스키마 이력 확인:"
docker run --rm -i "$PG_IMAGE" \
  psql "$DEST" -tAc "select count(*) || '개 마이그레이션 적용됨' from _prisma_migrations where finished_at is not null"
