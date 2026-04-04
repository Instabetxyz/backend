#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_ENV_FILE="$SCRIPT_DIR/../.env.demo"

if [[ -f "$DEMO_ENV_FILE" ]]; then
  set -a
  source "$DEMO_ENV_FILE"
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:${PORT:-5174}}"

JWT="${DEMO_DYNAMIC_JWT:-}"
JWT_HEADER="Authorization: Bearer $JWT"

make_request() {
  local method="$1"
  local endpoint="$2"
  local data="$3"
  local auth_header="$4"

  if [[ -n "$auth_header" ]]; then
    headers=("-H" "$auth_header")
  else
    headers=()
  fi

  if [[ -n "$data" ]]; then
    headers+=("-H" "Content-Type: application/json" "-d" "$data")
  fi

  curl -s -w "\n__HTTP_CODE__: %{http_code}" \
    -X "$method" \
    "${headers[@]}" \
    "${BASE_URL}${endpoint}"
}

get_json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | grep -o "\"${field}\"[^,}]*" | sed 's/.*: *"\?\([^"]*\)"\?/\1/'
}

print_success() {
  echo "✅ $1"
}

print_error() {
  echo "❌ $1"
}

print_info() {
  echo "ℹ️  $1"
}