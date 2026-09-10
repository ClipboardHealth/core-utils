module.exports = {
  "**/package.json": () => ["syncpack lint", "tsx ./populateLibraries.ts"],
  "**/*.md": ["markdownlint-cli2"],
  "**/*.{ts,tsx,js,jsx}": () => ["node --run lint"],
  "**/*.{ts,tsx,md,mdx}": () => ["node --run embed:check"],
  "**/*.{css,scss,graphql,js,json,jsonc,jsx,ts,tsx,md,mdx,toml,yml,yaml}": (files) => [
    `oxfmt --no-error-on-unmatched-pattern ${files.join(" ")}`,
  ],
};
