#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing POST /v1/stream/mock (create market) ==="

echo -e "\n--- Test 1: POST /v1/stream/mock (with auth) ---"
data='{
  "stream_url": "https://example.com/stream/test123",
  "condition": "Test condition for market creation via API test",
  "title": "Test Market",
  "initial_liquidity_wei": "1000000000000000000"
}'

response=$(make_request "POST" "/v1/stream/mock" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/stream/mock returned 201 (created)"
  echo "Response: $body"
  
  market_id=$(echo "$body" | grep -o '"market_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Created market_id: $market_id"
else
  print_error "POST /v1/stream/mock returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: POST /v1/stream/mock (without auth - 401) ---"
response=$(make_request "POST" "/v1/stream/mock" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "401" ]]; then
  print_success "POST /v1/stream/mock without auth returned 401"
else
  print_error "POST /v1/stream/mock without auth returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: POST /v1/stream/mock (invalid data - 400) ---"
data='{
  "stream_url": "not-a-valid-url",
  "condition": "x"
}'

response=$(make_request "POST" "/v1/stream/mock" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/stream/mock with invalid data returned 400"
else
  print_error "POST /v1/stream/mock with invalid data returned $http_code"
  echo "Response: $body"
fi