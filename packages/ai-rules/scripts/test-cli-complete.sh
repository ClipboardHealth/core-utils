#!/bin/bash
set -Eeuo pipefail

# ==============================================================================
# Complete CLI Test Suite for @clipboard-health/ai-rules
# ==============================================================================
#
# - Rebuilds the CLI from TypeScript source
# - Tests all profile combinations (frontend, backend, fullstack, common)
# - Tests custom ruleset combinations
# - Tests error handling (invalid inputs, missing options, conflicting flags)
# - Verifies generated file content matches expected rulesets
# - Provides detailed pass/fail summary
#
# - Uses isolated temporary directories under /tmp for each test
# - Cleans up all test directories automatically
# - Only rebuilds packages/ai-rules/dist (which is gitignored)
# - Does not modify any source files or repo state
#
# - Cleans dist/ directory before building
# - Creates unique temp directories using timestamps + random numbers
# - Each test is isolated and cleaned up afterward
# - Can be run repeatedly without any manual cleanup
# - Safe to run in CI/CD pipelines
#
# ==============================================================================

echo "🧪 Complete CLI Test Suite"
echo "============================"
echo ""

# Resolve repo root dynamically
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

# Clean and rebuild
echo "🧹 Cleaning..."
rm -rf packages/ai-rules/dist

echo ""
echo "📦 Building TypeScript CLI..."
npx nx build ai-rules

# Verify build
if [ ! -f "packages/ai-rules/dist/bin/cli.js" ]; then
  echo "❌ CLI not built!"
  exit 1
fi

echo "✅ CLI built successfully"
chmod +x packages/ai-rules/dist/bin/cli.js

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
  local TEST_NAME="$1"
  local CLI_ARGS="$2"
  local SHOULD_SUCCEED="$3"
  
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "📝 Test: $TEST_NAME"
  echo "═══════════════════════════════════════════════════"
  
  # Create test directory
  TEST_DIR="/tmp/ai-rules-test-$(date +%s)-$RANDOM"
  mkdir -p "$TEST_DIR"
  cd "$TEST_DIR"
  
  # Initialize
  npm init -y > /dev/null 2>&1
  npm install --save-dev "$REPO_ROOT/packages/ai-rules" > /dev/null 2>&1
  
  # Run CLI
  echo "Running: npx @clipboard-health/ai-rules apply $CLI_ARGS"
  if npx @clipboard-health/ai-rules apply $CLI_ARGS 2>&1; then
    CLI_EXIT_CODE=0
  else
    CLI_EXIT_CODE=$?
  fi
  
  # Check result
  if [ "$SHOULD_SUCCEED" = "yes" ]; then
    if [ $CLI_EXIT_CODE -eq 0 ]; then
      # Verify files were created
      FILE_COUNT=0
      for file in AGENTS.md CLAUDE.md .cursor; do
        if [ -e "$file" ]; then
          FILE_COUNT=$((FILE_COUNT + 1))
        fi
      done
      
      if [ $FILE_COUNT -eq 3 ]; then
        echo "✅ PASSED - Files generated correctly"
        TESTS_PASSED=$((TESTS_PASSED + 1))
      else
        echo "❌ FAILED - Expected 3 files, found $FILE_COUNT"
        TESTS_FAILED=$((TESTS_FAILED + 1))
      fi
    else
      echo "❌ FAILED - CLI exited with error code $CLI_EXIT_CODE"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
  else
    if [ $CLI_EXIT_CODE -ne 0 ]; then
      echo "✅ PASSED - Error caught as expected"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo "❌ FAILED - Should have failed but succeeded"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
  fi
  
  # Cleanup
  cd "$REPO_ROOT"
  rm -rf "$TEST_DIR"
}

# ======================
# PROFILE TESTS
# ======================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Testing Profiles"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "Profile: frontend" "--profile=frontend" "yes"
run_test "Profile: backend" "--profile=backend" "yes"
run_test "Profile: fullstack" "--profile=fullstack" "yes"
run_test "Profile: common" "--profile=common" "yes"

# ======================
# RULESET TESTS
# ======================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Testing Rulesets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "Ruleset: common,frontend" "--ruleset=common,frontend" "yes"
run_test "Ruleset: common,backend" "--ruleset=common,backend" "yes"
run_test "Ruleset: common,frontend,backend" "--ruleset=common,frontend,backend" "yes"
run_test "Ruleset: frontend,backend" "--ruleset=frontend,backend" "yes"
run_test "Ruleset: common" "--ruleset=common" "yes"

# ======================
# ERROR CASES
# ======================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Testing Error Cases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_test "Error: No options" "" "no"
run_test "Error: Invalid profile" "--profile=invalid" "no"
run_test "Error: Invalid ruleset" "--ruleset=invalid" "no"
run_test "Error: Both profile and ruleset" "--profile=frontend --ruleset=common" "no"

# ======================
# CONTENT VERIFICATION
# ======================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Testing Content Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "📝 Verifying backend profile content..."
TEST_DIR="/tmp/ai-rules-content-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

npm init -y > /dev/null 2>&1
npm install --save-dev "$REPO_ROOT/packages/ai-rules" > /dev/null 2>&1

npx @clipboard-health/ai-rules apply --profile=backend > /dev/null 2>&1

CONTENT_PASS=true

if ! grep -q "NestJS" AGENTS.md; then
  echo "❌ Backend content missing: NestJS"
  CONTENT_PASS=false
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if ! grep -q "TypeScript" AGENTS.md; then
  echo "❌ Common content missing: TypeScript"
  CONTENT_PASS=false
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if grep -q "React" AGENTS.md; then
  echo "❌ Frontend content should not be present: React"
  CONTENT_PASS=false
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

if [ "$CONTENT_PASS" = true ]; then
  echo "✅ Content verification passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

cd "$REPO_ROOT"
rm -rf "$TEST_DIR"

# ======================
# SUMMARY
# ======================

echo ""
echo "═══════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "═══════════════════════════════════════════════════"
echo "✅ Passed: $TESTS_PASSED"
echo "❌ Failed: $TESTS_FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -eq 0 ]; then
  echo ""
  echo "🎉 ALL TESTS PASSED!"
  echo ""
  exit 0
else
  echo ""
  echo "💥 SOME TESTS FAILED!"
  echo ""
  exit 1
fi

