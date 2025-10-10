const { ESLint } = require("eslint");

// See https://github.com/lint-staged/lint-staged/tree/05fb3829faa5437276d98450c34699fecfc8c1c8?tab=readme-ov-file#eslint--7-1
const esLintIgnored = async (files) => {
  const eslint = new ESLint();
  const isIgnored = await Promise.all(files.map((f) => eslint.isPathIgnored(f)));
  return files.filter((_, i) => !isIgnored[i]).join(" ");
};

module.exports = {
  "**/*": async (files) => [`npm run cspell -- ${files.join(" ")}`, `npm run knip`],
  "**/*.{ts,tsx,js,jsx}": async (files) => [
    `eslint --fix --max-warnings=0 ${await esLintIgnored(files)}`,
  ],
  "**/*.{ts,tsx,md,mdx}": async () => [`npm run embed:check`],
  "**/*.{css,scss,graphql,js,json,jsx,ts,tsx,md,mdx,toml,yml,yaml}": async (files) => [
    `prettier --write ${files.join(" ")}`,
  ],
  "**/package.json": async () => [
    process.env.NX_RELEASE === "true" ? `syncpack fix-mismatches` : `syncpack lint`,
    "tsx ./populateLibraries.ts",
  ],
  "packages/ai-rules/**/*.md": async () => ["nx run ai-rules:apply"],
};
