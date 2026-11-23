import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  eslintCompat: true,
  languageOptions: {
    parserOptions: { lang: "tsx" },
    sourceType: "module",
  },
});

function rawColor(color: string) {
  return { messageId: "rawColor", data: { color } } as const;
}

ruleTester.run("no-raw-color", rule, {
  valid: [
    { name: "relative URL fragment", code: 'const href = "/page#abc";' },
    { name: "absolute URL fragment", code: 'const href = "https://x.com/#fff";' },
    { name: "markdown heading", code: 'const heading = "# Title";' },
    { name: "non-hex text after #", code: 'const label = "ticket #123x";' },
    { name: "one hex digit", code: 'const value = "#f";' },
    { name: "two hex digits", code: 'const value = "#ff";' },
    { name: "five hex digits", code: 'const value = "#fffff";' },
    { name: "seven hex digits", code: 'const value = "#fffffff";' },
    { name: "nine hex digits", code: 'const value = "#fffffffff";' },
    { name: "hex inside a longer word", code: 'const value = "abc#fff";' },
    { name: "rgb without parenthesis", code: 'const value = "rgb";' },
    { name: "hsl without parenthesis", code: 'const value = "use hsl values";' },
    { name: "color function name inside a word", code: 'const value = "torgb(";' },
    { name: "named colors", code: 'const style = { color: "red", background: "transparent" };' },
    { name: "JSX text", code: "const element = <p>Use #fff or rgb(0, 0, 0)</p>;" },
    { name: "import specifier", code: 'import { theme } from "#abc";' },
    { name: "side-effect import specifier", code: 'import "#fff";' },
    { name: "export from specifier", code: 'export { theme } from "#abc";' },
    { name: "export all specifier", code: 'export * from "#abc";' },
    { name: "dynamic import specifier", code: 'const module = import("#abc");' },
    { name: "dynamic import template specifier", code: "const module = import(`#abc`);" },
    { name: "identifier", code: "const rgb = 1; const fff = rgb;" },
    { name: "comments", code: "// color: #fff, rgb(0, 0, 0)\n/* hsl(0, 0%, 0%) */\nconst x = 1;" },
    { name: "regex literal", code: "const pattern = /#fff|rgb\\(/;" },
    { name: "template substitution only", code: `const value = \`\${color}\`;` },
  ],
  invalid: [
    {
      name: "three-digit hex",
      code: 'const color = "#fff";',
      errors: [{ ...rawColor("#fff"), line: 1, column: 16 }],
    },
    {
      name: "four-digit hex",
      code: 'const color = "#ffff";',
      errors: [rawColor("#ffff")],
    },
    {
      name: "six-digit hex",
      code: 'const color = "#ffffff";',
      errors: [rawColor("#ffffff")],
    },
    {
      name: "eight-digit hex",
      code: 'const color = "#ffffff80";',
      errors: [rawColor("#ffffff80")],
    },
    {
      name: "uppercase hex after a colon",
      code: 'const rule = "color:#ABCDEF;";',
      errors: [rawColor("#ABCDEF")],
    },
    {
      name: "rgb",
      code: 'const color = "rgb(0, 0, 0)";',
      errors: [rawColor("rgb(")],
    },
    {
      name: "rgba",
      code: 'const color = "rgba(0, 0, 0, 0.5)";',
      errors: [rawColor("rgba(")],
    },
    {
      name: "hsl",
      code: 'const color = "hsl(0, 0%, 0%)";',
      errors: [rawColor("hsl(")],
    },
    {
      name: "hsla",
      code: 'const color = "hsla(0, 0%, 0%, 0.5)";',
      errors: [rawColor("hsla(")],
    },
    {
      name: "uppercase color function with whitespace before the parenthesis",
      code: 'const color = "RGBA  (0, 0, 0, 0.5)";',
      errors: [rawColor("RGBA  (")],
    },
    {
      name: "mixed-case color function",
      code: 'const color = "Hsl(0, 0%, 0%)";',
      errors: [rawColor("Hsl(")],
    },
    {
      name: "colors inside linear-gradient",
      code: 'const background = "linear-gradient(#000, #fff, #ccc)";',
      errors: [
        { ...rawColor("#000"), line: 1, column: 37 },
        { ...rawColor("#fff"), line: 1, column: 43 },
        { ...rawColor("#ccc"), line: 1, column: 49 },
      ],
    },
    {
      name: "hex and color function in one string",
      code: 'const background = "linear-gradient(rgb(0, 0, 0), #fff)";',
      errors: [
        { ...rawColor("rgb("), line: 1, column: 37 },
        { ...rawColor("#fff"), line: 1, column: 51 },
      ],
    },
    {
      name: "JSX attribute",
      code: 'const icon = <path fill="#000" />;',
      errors: [{ ...rawColor("#000"), line: 1, column: 26 }],
    },
    {
      name: "sx prop",
      code: 'const box = <Box sx={{ color: "#333" }} />;',
      errors: [rawColor("#333")],
    },
    {
      name: "template literal without substitutions",
      code: "const color = `#fff`;",
      errors: [rawColor("#fff")],
    },
    {
      name: "template literal with substitutions",
      code: `const border = \`\${width}px solid #ccc\`;`,
      errors: [{ ...rawColor("#ccc"), line: 1, column: 34 }],
    },
    {
      name: "tagged template",
      code: "const styles = css`color: #fff;`;",
      errors: [rawColor("#fff")],
    },
    {
      name: "colors in the head and a later quasi of a template",
      code: `const styles = css\`
  color: #fff;
  margin: \${margin}px;
  background: rgba(0, 0, 0, 0.5);
\`;`,
      errors: [
        { ...rawColor("#fff"), line: 2, column: 10 },
        { ...rawColor("rgba("), line: 4, column: 15 },
      ],
    },
    {
      name: "object property value on a later line",
      code: 'const theme = {\n  primary: "#123456",\n};',
      errors: [{ ...rawColor("#123456"), line: 2, column: 13 }],
    },
    {
      name: "string with an escape sequence reports at the literal",
      code: 'const color = "\\t#fff";',
      errors: [{ ...rawColor("#fff"), line: 1, column: 15 }],
    },
    {
      name: "template with an escape sequence reports at the template",
      code: "const color = `\\t#fff`;",
      errors: [{ ...rawColor("#fff"), line: 1, column: 15 }],
    },
  ],
});
