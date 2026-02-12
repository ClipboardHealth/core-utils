// @ts-check

/** @type {import("syncpack").RcFile} */
module.exports = {
  dependencyTypes: ["!local"],
  semverGroups: [
    {
      dependencyTypes: ["dev", "prod", "resolutions"],
      dependencies: ["**"],
      packages: ["**"],
      range: "",
    },
  ],
  versionGroups: [
    {
      dependencies: ["eslint", "@typescript-eslint/**"],
      isIgnored: true,
      label: "Nx isn't ready for eslint 9 upgrade yet.",
    },
    {
      dependencies: ["@swc/core", "@anthropic-ai/claude-agent-sdk"],
      isIgnored: true,
      label: "Override uses syntax unsupported by syncpack.",
    },
    {
      dependencyTypes: ["peer"],
      specifierTypes: "range",
      label: "Allow for flexible peer dependency versions.",
    },
    {
      dependencies: ["@types/**"],
      dependencyTypes: ["!dev"],
      isBanned: true,
      label: "@types packages should only be under devDependencies.",
    },
  ],
};
