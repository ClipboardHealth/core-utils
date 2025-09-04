#!/bin/bash

# Test against a single axios version
# Usage: ./test-single-version.sh 1.8.2

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <axios-version>"
    echo "Example: $0 1.8.2"
    exit 1
fi

VERSION=$1
PACKAGE_DIR=$(dirname $(dirname $(realpath $0)))

echo "🔍 Testing @clipboard-health/axios-error with axios@$VERSION"

# Save original package.json
cp "$PACKAGE_DIR/package.json" "$PACKAGE_DIR/package.json.backup"

# Update axios version
cd "$PACKAGE_DIR"
npm install "axios@$VERSION" --save-dev

echo "📦 Installed axios@$VERSION"

# Run tests
echo "🧪 Running tests..."
if npm test; then
    echo "✅ Tests passed with axios@$VERSION"
    exit_code=0
else
    echo "❌ Tests failed with axios@$VERSION"
    exit_code=1
fi

# Restore original package.json and reinstall
echo "🔄 Restoring original dependencies..."
mv "$PACKAGE_DIR/package.json.backup" "$PACKAGE_DIR/package.json"
npm install

exit $exit_code