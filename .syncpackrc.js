// @ts-check

/** @type {import("syncpack").RcFile} */
module.exports = {
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
      dependencies: ["@clipboard-health/**"],
      specifierTypes: ["latest"],
      isIgnored: true,
      label: "Ignore local workspace dependencies using * version.",
    },
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
      specifierTypes: ["range", "range-complex", "range-major", "range-minor"],
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
