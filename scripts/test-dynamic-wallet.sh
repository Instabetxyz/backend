#!/bin/bash
source "$(dirname "$0")/test-common.sh"

SUB="${1:-e94c0957-c64e-40be-9dfb-53d5d98617f4}"

echo "=== Testing fetchWalletFromDynamic ==="
echo "User ID (sub): $SUB"
echo "Environment ID: $DYNAMIC_ENV_ID"
echo ""

url="https://app.dynamicauth.com/api/v0/environments/${DYNAMIC_ENV_ID}/users/${SUB}/wallets"

echo "Calling: $url"
echo ""

response=$(curl -s -w "\n__HTTP_CODE__: %{http_code}" \
  -H "Authorization: Bearer ${DYNAMIC_API_KEY}" \
  "$url")

http_code=$(echo "$response" | grep -o "__HTTP_CODE__: [0-9]*" | cut -d' ' -f2)
body=$(echo "$response" | sed 's/__HTTP_CODE__:.*//')

if [[ "$http_code" == "200" ]]; then
  wallet=$(echo "$body" | grep -o '"publicKey":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ -n "$wallet" ]]; then
    print_success "Fetched wallet address: $wallet"
  else
    print_error "Response missing publicKey field"
    echo "Response: $body"
  fi
else
  print_error "Failed with HTTP $http_code"
  echo "Response: $body"
fi
