#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "=== Testing POST /v1/agents (register agent) ==="

echo -e "\n--- Test 1: POST /v1/agents (valid data) ---"
data='{
  "name": "Test Agent",
  "description": "A test agent created via API test",
  "wallet_address": "0xeeb3e0999D01f0d1Ed465513E414725a357F6ae4",
  "public_key": "0x90ae4147972a8114b0ef402d0a4954e6e11ffdeee76d999d1bf4d3a593ec834b682207b6cb754d7290192cb52aa782edd5dbb2556d18f6956ef71d6a1cabf6be",
  "strategy_config": {
    "type": "trend_following",
    "threshold": 0.05
  }
}'

response=$(make_request "POST" "/v1/agents" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "201" ]]; then
  print_success "POST /v1/agents returned 201 (created)"
  echo "Response: $body"
else
  print_error "POST /v1/agents returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 2: POST /v1/agents (invalid wallet address - 400) ---"
data='{
  "name": "Test Agent 2",
  "wallet_address": "0xinvalid"
}'

response=$(make_request "POST" "/v1/agents" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/agents with invalid wallet returned 400"
else
  print_error "POST /v1/agents with invalid wallet returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 3: POST /v1/agents (missing name - 400) ---"
data='{
  "wallet_address": "0x1234567890123456789012345678901234567890"
}'

response=$(make_request "POST" "/v1/agents" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/agents with missing name returned 400"
else
  print_error "POST /v1/agents with missing name returned $http_code"
  echo "Response: $body"
fi

echo -e "\n--- Test 4: POST /v1/agents (name too long - 400) ---"
data='{
  "name": "ThisIsAVeryLongNameThatExceedsTheMaximumAllowedLengthOf64CharactersForTheAgentName",
  "wallet_address": "0x1234567890123456789012345678901234567890"
}'

response=$(make_request "POST" "/v1/agents" "$data" "")
http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "400" ]]; then
  print_success "POST /v1/agents with too long name returned 400"
else
  print_error "POST /v1/agents with too long name returned $http_code"
  echo "Response: $body"
fi