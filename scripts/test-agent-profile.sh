#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing GET /v1/agents/:id (get agent profile) ==="

echo -e "\n--- Finding an agent to test ---"
response=$(make_request "GET" "/v1/agents" "" "$JWT_HEADER")
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')
agent_id=$(echo "$body" | grep -o '"agent_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$agent_id" ]]; then
  print_info "No agents found in database"
  agent_id="00000000-0000-0000-0000-000000000000"
fi

echo "Using agent_id: $agent_id"

echo -e "\n--- Test 1: GET /v1/agents/:id (public profile) ---"
response=$(make_request "GET" "/v1/agents/$agent_id" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/agents/$agent_id returned 200"
  echo "Response: $body"
else
  print_error "GET /v1/agents/$agent_id returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: GET /v1/agents/:id with auth (optional) ---"
response=$(make_request "GET" "/v1/agents/$agent_id" "" "$JWT_HEADER")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  print_success "GET /v1/agents/$agent_id with auth returned 200"
else
  print_error "GET /v1/agents/$agent_id with auth returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: GET /v1/agents/invalid-id (404) ---"
response=$(make_request "GET" "/v1/agents/00000000-0000-0000-0000-000000000000" "" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "404" ]]; then
  print_success "GET /v1/agents/invalid-id returned 404"
else
  print_error "GET /v1/agents/invalid-id returned $http_code"
  echo "Response: $body"
fi