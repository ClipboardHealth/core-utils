/**
 * @fileoverview Rule to disallow raw color literals in strings.
 *
 * Reports hex colors (`#fff`, `#ffff`, `#ffffff`, `#ffffff80`) and the start of `rgb()`, `rgba()`,
 * `hsl()` and `hsla()` calls in string literals, including JSX attribute values, and in each static
 * part of a template literal, including tagged templates such as `` css`color: #fff;` ``. Each
 * match is a separate report on the literal that holds it.
 *
 * A hex color must start the string or follow whitespace or one of `:;,()`, so URL fragments
 * (`/page#abc`), markdown headings (`# Title`) and text such as `ticket #123x` don't match. CSS
 * named colors (`red`, `transparent`) and JSX text are not checked, nor are module specifiers, so a
 * subpath import such as `"#abc"` passes.
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

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
    function reportColors(node: ESTree.Node, text: string): void {
      for (const color of findRawColors(text)) {
        context.report({ node, messageId: "rawColor", data: { color } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string" || isModuleSpecifier(node)) {
          return;
        }

        reportColors(node, node.value);
      },
      TemplateLiteral(node) {
        if (isModuleSpecifier(node)) {
          return;
        }

        for (const quasi of node.quasis) {
          reportColors(node, quasi.value.cooked ?? quasi.value.raw);
        }
      },
    };
  },
});

function findRawColors(text: string): string[] {
  // Created per call: global regexes keep `lastIndex` between uses.
  const hexColorPattern = /(?<=^|[\s:;,()])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const colorFunctionPattern = /\b(?:rgba?|hsla?)\s*\(/gi;

  return [
    ...Array.from(text.matchAll(hexColorPattern), ([match]) => match),
    ...Array.from(text.matchAll(colorFunctionPattern), ([match]) => match),
  ];
}

function isModuleSpecifier(node: ESTree.Node): boolean {
  const { parent } = node;
  switch (parent?.type) {
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
    case "ImportExpression": {
      return parent.source === node;
    }
    default: {
      return false;
    }
  }
}

export default rule;
