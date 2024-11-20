const { ESLint } = require("eslint");

// See https://github.com/okonet/lint-staged/tree/05fb3829faa5437276d98450c34699fecfc8c1c8#how-can-i-ignore-files-from-eslintignore
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
  "**/*.{ts,tsx,md,mdx}": async (files) => [`npm run embed:check`],
  "**/*.{css,scss,graphql,js,json,jsx,ts,tsx,md,mdx,toml,yml,yaml}": async (files) => [
    `prettier --write ${files.join(" ")}`,
  ],
  "**/package.json": async () => [`syncpack lint`, "tsx ./populateLibraries.ts"],
};
