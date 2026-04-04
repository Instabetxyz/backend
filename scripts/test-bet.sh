#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing POST /v1/markets/:id/bet (place bet) ==="

echo -e "\n--- Finding a market to bet on ---"
response=$(make_request "GET" "/v1/markets?status=active&limit=1" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

market_id=""
if [[ "$http_code" == "200" ]]; then
  market_id=$(echo "$body" | grep -o '"market_id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [[ -z "$market_id" ]]; then
  print_info "No active market found. Creating a test market..."
  
  data='{
    "stream_url": "https://example.com/stream/bet-test",
    "condition": "Test bet on this market",
    "title": "Bet Test Market",
    "initial_liquidity_wei": "1000000000000000000"
  }'
  
  response=$(make_request "POST" "/v1/stream" "$data" "$JWT_HEADER")
  body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')
  market_id=$(echo "$body" | grep -o '"market_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [[ -z "$market_id" ]]; then
    print_error "Failed to create test market"
    echo "Response: $body"
    exit 1
  fi
  print_info "Created market for testing: $market_id"
fi

echo "Using market_id: $market_id"

echo -e "\n--- Test 1: POST /v1/markets/:id/bet (yes, with auth) ---"
data='{
  "side": "yes",
  "amount_wei": "1000000000000000"
}'

response=$(make_request "POST" "/v1/markets/$market_id/bet" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/markets/$market_id/bet (yes) returned 201"
  echo "Response: $body"
else
  print_error "POST /v1/markets/$market_id/bet (yes) returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: POST /v1/markets/:id/bet (no, with auth) ---"
data='{
  "side": "no",
  "amount_wei": "2000000000000000"
}'

response=$(make_request "POST" "/v1/markets/$market_id/bet" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/markets/$market_id/bet (no) returned 201"
  echo "Response: $body"
else
  print_error "POST /v1/markets/$market_id/bet (no) returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: POST /v1/markets/:id/bet (without auth - 401) ---"
data='{
  "side": "yes",
  "amount_wei": "1000000000000000"
}'

response=$(make_request "POST" "/v1/markets/$market_id/bet" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "401" ]]; then
  print_success "POST /v1/markets/:id/bet without auth returned 401"
else
  print_error "POST /v1/markets/:id/bet without auth returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 4: POST /v1/markets/:id/bet (invalid side - 400) ---"
data='{
  "side": "maybe",
  "amount_wei": "1000000000000000"
}'

response=$(make_request "POST" "/v1/markets/$market_id/bet" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/markets/:id/bet with invalid side returned 400"
else
  print_error "POST /v1/markets/:id/bet with invalid side returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 5: POST /v1/markets/:id/bet (invalid amount - 400) ---"
data='{
  "side": "yes",
  "amount_wei": "not-a-number"
}'

response=$(make_request "POST" "/v1/markets/$market_id/bet" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/markets/:id/bet with invalid amount returned 400"
else
  print_error "POST /v1/markets/:id/bet with invalid amount returned $http_code"
  echo "Response: $body"
fi