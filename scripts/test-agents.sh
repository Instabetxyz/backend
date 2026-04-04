#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing GET /v1/agents (list agents) ==="

echo -e "\n--- Test 1: GET /v1/agents (with auth) ---"
response=$(make_request "GET" "/v1/agents" "" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/agents returned 200"
  echo "Response: $body"
  
  first_agent_id=$(echo "$body" | grep -o '"agent_id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ -n "$first_agent_id" ]]; then
    echo "Found agent_id: $first_agent_id"
  fi
else
  print_error "GET /v1/agents returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: GET /v1/agents?sort_by=pnl ---"
response=$(make_request "GET" "/v1/agents?sort_by=pnl&limit=10" "" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/agents?sort_by=pnl returned 200"
else
  print_error "GET /v1/agents?sort_by=pnl returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: GET /v1/agents (without auth - 200) ---"
response=$(make_request "GET" "/v1/agents" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/agents without auth returned 401"
else
  print_error "GET /v1/agents without auth returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 4: GET /v1/agents?sort_by=invalid (400) ---"
response=$(make_request "GET" "/v1/agents?sort_by=invalid" "" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "GET /v1/agents?sort_by=invalid returned 400"
else
  print_error "GET /v1/agents?sort_by=invalid returned $http_code"
  echo "Response: $body"
fi