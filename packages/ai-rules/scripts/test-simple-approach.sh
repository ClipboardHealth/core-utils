#!/bin/bash

# Test script to verify the simple cp-based approach works

set -e

echo "🧪 Testing Simple CP-Based Approach"
echo "===================================="
echo ""

# Create a temp test directory
TEST_DIR=$(mktemp -d)
echo "📁 Test directory: $TEST_DIR"

# Initialize a fake node_modules structure
mkdir -p "$TEST_DIR/node_modules/@clipboard-health/ai-rules/dist"

# Copy the built dist files to simulate installed package
echo "📦 Simulating package installation..."
cp -r "$(dirname "$0")/../dist/"* "$TEST_DIR/node_modules/@clipboard-health/ai-rules/dist/"

# Test each profile
PROFILES=("frontend" "backend" "fullstack" "common")

for profile in "${PROFILES[@]}"; do
  echo ""
  echo "🧪 Testing profile: $profile"
  
  # Clean up previous test files
  rm -rf "$TEST_DIR/AGENTS.md" "$TEST_DIR/CLAUDE.md" "$TEST_DIR/.cursor"
  
  # Simulate the cp command from package.json
  cp -r "$TEST_DIR/node_modules/@clipboard-health/ai-rules/dist/$profile/." "$TEST_DIR/"
  
  # Verify files were copied
  if [ -f "$TEST_DIR/AGENTS.md" ] && [ -f "$TEST_DIR/CLAUDE.md" ] && [ -d "$TEST_DIR/.cursor" ]; then
    echo "   ✅ All files copied successfully"
  else
    echo "   ❌ Missing files!"
    exit 1
  fi
done

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "✨ All tests passed!"
echo ""
echo "📝 Usage in consumer projects:"
echo '  "scripts": {'
echo "    \"sync-ai-rules\": \"cp -r ./node_modules/@clipboard-health/ai-rules/dist/frontend/. ./\","
echo "    \"postinstall\": \"npm run sync-ai-rules\""
echo "  }"

