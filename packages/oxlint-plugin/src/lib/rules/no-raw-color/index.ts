/**
 * @fileoverview Rule to disallow raw color literals in strings.
 *
 * Reports hex colors (`#fff`, `#ffff`, `#ffffff`, `#ffffff80`) and the start of `rgb()`, `rgba()`,
 * `hsl()` and `hsla()` calls in string literals, including JSX attribute values, and in each static
 * part of a template literal, including tagged templates such as `` css`color: #fff;` ``. Each
 * match is a separate report at the match's own position, so a disable comment covers only the
 * line it precedes. A string with escape sequences is reported at the literal instead.
 *
 * A hex color must start the string or follow whitespace or one of `:;,()`, so URL fragments
 * (`/page#abc`), markdown headings (`# Title`) and text such as `ticket #123x` don't match. CSS
 * named colors (`red`, `transparent`) and JSX text are not checked, nor are module specifiers, so a
 * subpath import such as `"#abc"` passes.
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

const HEX_COLOR_PATTERN = /(?<=^|[\s:;,()])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const COLOR_FUNCTION_PATTERN = /\b(?:rgba?|hsla?)\s*\(/gi;
const OPENING_DELIMITER_LENGTH = 1;

interface RawColorMatch {
  color: string;
  index: number;
}

interface StringSource {
  node: ESTree.Node;
  value: string;
  raw: string | undefined;
  rawStart: number;
}

const rule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow raw color literals; use theme color tokens instead",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/no-raw-color",
    },
    schema: [],
    messages: {
      rawColor: 'Raw color "{{color}}". Use a theme color token instead.',
    },
  },
  create(context) {
    function reportColors({ node, value, raw, rawStart }: StringSource): void {
      const hasExactOffsets = value === raw;
      for (const { color, index } of findRawColors(value)) {
        const location = hasExactOffsets
          ? {
              loc: {
                start: context.sourceCode.getLocFromIndex(rawStart + index),
                end: context.sourceCode.getLocFromIndex(rawStart + index + color.length),
              },
            }
          : { node };
        context.report({ ...location, messageId: "rawColor", data: { color } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string" || isModuleSpecifier(node)) {
          return;
        }

        reportColors({
          node,
          value: node.value,
          raw: node.raw?.slice(1, -1),
          rawStart: node.start + OPENING_DELIMITER_LENGTH,
        });
      },
      TemplateLiteral(node) {
        if (isModuleSpecifier(node)) {
          return;
        }

        for (const quasi of node.quasis) {
          reportColors({
            node,
            value: quasi.value.cooked ?? quasi.value.raw,
            raw: quasi.value.raw,
            rawStart: quasi.start + OPENING_DELIMITER_LENGTH,
          });
        }
      },
    };
  },
});

function findRawColors(text: string): RawColorMatch[] {
  return [...text.matchAll(HEX_COLOR_PATTERN), ...text.matchAll(COLOR_FUNCTION_PATTERN)].map(
    (match) => ({ color: match[0], index: match.index }),
  );
}

function isModuleSpecifier(node: ESTree.Node): boolean {
  const { parent } = node;
  switch (parent?.type) {
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
    case "ImportExpression":
    case "TSImportType": {
      return parent.source === node;
    }
    case "TSExternalModuleReference": {
      return parent.expression === node;
    }
    default: {
      return false;
    }
  }
}

export default rule;
