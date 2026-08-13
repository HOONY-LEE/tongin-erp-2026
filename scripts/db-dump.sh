#!/usr/bin/env bash
# DB 전체를 덤프한다. 백업용이자, 나중에 다른 Postgres(AWS RDS 등)로 옮기는 수단.
#
#   ./scripts/db-dump.sh "postgresql://..." [출력파일]
#
# pg_dump 는 서버보다 낮은 버전이면 거부하므로, 로컬에 뭐가 깔려 있든
# Docker로 버전을 고정해 실행한다.
set -euo pipefail

SRC="${1:-}"
OUT="${2:-backup/tongin-$(date +%Y%m%d-%H%M%S).dump}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

if [ -z "$SRC" ]; then
  echo "사용법: $0 <DATABASE_URL> [출력파일]" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

# -Fc(커스텀 포맷): 압축되고, 복원 시 선택적 적용이 가능하다.
# --no-owner/--no-acl: 옮겨갈 서버의 롤 이름이 달라도 복원되도록.
docker run --rm -i "$PG_IMAGE" \
  pg_dump --format=custom --no-owner --no-acl --dbname "$SRC" > "$OUT"

echo "덤프 완료: $OUT ($(du -h "$OUT" | cut -f1))"
