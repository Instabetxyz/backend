#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing /v1/markets endpoints ==="

echo -e "\n--- Test 1: GET /v1/markets (list all) ---"
response=$(make_request "GET" "/v1/markets" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/markets returned 200"
  echo "Response: $body"
  
  first_market_id=$(echo "$body" | grep -o '"market_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ -n "$first_market_id" ]]; then
    echo "Found market_id: $first_market_id"
  fi
else
  print_error "GET /v1/markets returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: GET /v1/markets?status=active ---"
response=$(make_request "GET" "/v1/markets?status=active" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/markets?status=active returned 200"
else
  print_error "GET /v1/markets?status=active returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: GET /v1/markets?limit=5 ---"
response=$(make_request "GET" "/v1/markets?limit=5" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/markets?limit=5 returned 200"
else
  print_error "GET /v1/markets?limit=5 returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 4: GET /v1/markets/:id (single market) ---"
if [[ -n "$first_market_id" ]]; then
  response=$(make_request "GET" "/v1/markets/$first_market_id" "" "")
  http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
  body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

  if [[ "$http_code" == "200" ]]; then
    print_success "GET /v1/markets/$first_market_id returned 200"
    echo "Response: $body"
  else
    print_error "GET /v1/markets/$first_market_id returned $http_code"
    echo "Response: $body"
  fi
else
  print_info "No market found to test single market endpoint"
fi

echo -e "\n--- Test 5: GET /v1/markets/invalid-id (404) ---"
response=$(make_request "GET" "/v1/markets/00000000-0000-0000-0000-000000000000" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "404" ]]; then
  print_success "GET /v1/markets/invalid-id returned 404 (not found)"
else
  print_error "GET /v1/markets/invalid-id returned $http_code"
  echo "Response: $body"
fi