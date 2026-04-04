#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing POST /v1/agents/:id/follow (follow agent) ==="

echo -e "\n--- Finding an agent to follow ---"
agent_id="${AGENT_ID:-}"
if [[ -z "$agent_id" ]]; then
  response=$(make_request "GET" "/v1/agents" "" "$JWT_HEADER")
  body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')
  agent_id=$(echo "$body" | grep -o '"agent_id":"[^"]*"' | head -1 | cut -d'"' -f4)
fi

if [[ -z "$agent_id" ]]; then
  print_error "No agents found. Please set AGENT_ID or create an agent first."
  exit 1
fi

echo "Using agent_id: $agent_id"

echo -e "\n--- Test 1: POST /v1/agents/:id/follow (copy mode, with auth) ---"
data='{
  "mode": "copy",
  "copy_fraction": 0.5,
  "max_bet_wei": "1000000000000000000"
}'

response=$(make_request "POST" "/v1/agents/$agent_id/follow" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/agents/$agent_id/follow (copy) returned $http_code"
  echo "Response: $body"
else
  print_error "POST /v1/agents/$agent_id/follow (copy) returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: POST /v1/agents/:id/follow (short mode) ---"
data='{
  "mode": "short"
}'

response=$(make_request "POST" "/v1/agents/$agent_id/follow" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/agents/$agent_id/follow (short) returned $http_code"
else
  print_error "POST /v1/agents/$agent_id/follow (short) returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: POST /v1/agents/:id/follow (without auth - 401) ---"
data='{
  "mode": "copy"
}'

response=$(make_request "POST" "/v1/agents/$agent_id/follow" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "401" ]]; then
  print_success "POST /v1/agents/:id/follow without auth returned 401"
else
  print_error "POST /v1/agents/:id/follow without auth returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 4: POST /v1/agents/:id/follow (invalid mode - 400) ---"
data='{
  "mode": "invalid_mode"
}'

response=$(make_request "POST" "/v1/agents/$agent_id/follow" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/agents/:id/follow with invalid mode returned 400"
else
  print_error "POST /v1/agents/:id/follow with invalid mode returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 5: POST /v1/agents/:id/follow (invalid copy_fraction - 400) ---"
data='{
  "mode": "copy",
  "copy_fraction": 2.0
}'

response=$(make_request "POST" "/v1/agents/$agent_id/follow" "$data" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/agents/:id/follow with invalid copy_fraction returned 400"
else
  print_error "POST /v1/agents/:id/follow with invalid copy_fraction returned $http_code"
  echo "Response: $body"
fi