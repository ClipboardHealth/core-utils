#!/usr/bin/env bash
# Audit every Jinja variable referenced in the SQL cells of a migration.
# Use this to cross-check against the project's defined Input cells before importing.
# A variable referenced in SQL but missing from inputs → "Undefined variable(s)" at run time.
#
# Usage:
#   audit_vars.sh <cells_dir>
set -euo pipefail

DIR="${1:-./hex_cells}"

echo "=== Jinja variables per cell in $DIR ==="
for f in "$DIR"/*.sql; do
  vars=$(grep -oE '\{[%{][- ]*(if +[a-z_]+|[a-z_]+) [- ]*[%}]\}' "$f" 2>/dev/null \
         | grep -oE '[a-z_]+' \
         | grep -v -E '^(if|else|elif|endif|endfor|for|in)$' \
         | sort -u | tr '\n' ',' | sed 's/,$//')
  echo "$(basename "$f")  →  ${vars:-(none)}"
done

echo
echo "=== Union of all referenced vars (this must be a subset of the project's Input names) ==="
grep -rohE '\{[%{][- ]*(if +[a-z_]+|[a-z_]+) [- ]*[%}]\}' "$DIR"/*.sql 2>/dev/null \
  | grep -oE '[a-z_]+' \
  | grep -v -E '^(if|else|elif|endif|endfor|for|in)$' \
  | sort -u
