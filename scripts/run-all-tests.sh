#!/bin/bash
source "$(dirname "$0")/test-common.sh"

echo "========================================"
echo "Running All API Tests"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL=0
PASSED=0
FAILED=0

run_test() {
  local test_name="$1"
  local test_script="$2"
  
  ((TOTAL++))
  echo "Running: $test_name"
  
  if bash "$SCRIPT_DIR/$test_script" > /tmp/test_output_$TOTAL.txt 2>&1; then
    ((PASSED++))
    echo "✅ PASSED: $test_name"
  else
    ((FAILED++))
    echo "❌ FAILED: $test_name"
    echo "--- Output ---"
    cat /tmp/test_output_$TOTAL.txt
    echo "--- End ---"
  fi
  echo ""
}

run_test "GET /health" "test-health.sh"
run_test "GET /v1/markets (list)" "test-markets.sh"
run_test "POST /v1/stream" "test-stream.sh"
run_test "POST /v1/markets/:id/bet" "test-bet.sh"
run_test "GET /v1/agents (list)" "test-agents.sh"
run_test "GET /v1/agents/:id (profile)" "test-agent-profile.sh"
run_test "POST /v1/agents (register)" "test-register-agent.sh"
run_test "POST /v1/agents/:id/follow" "test-follow-agent.sh"

echo "========================================"
echo "Test Results"
echo "========================================"
echo "Total:  $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo "🎉 All tests passed!"
  exit 0
else
  echo "⚠️  Some tests failed. Review output above."
  exit 1
fi