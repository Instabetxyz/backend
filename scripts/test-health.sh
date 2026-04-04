#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "Testing GET /health..."

response=$(make_request "GET" "/health" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /health returned 200"
  echo "Response: $body"
else
  print_error "GET /health returned $http_code"
  echo "Response: $body"
fi