// @ts-check

/** @type {import("syncpack").RcFile} */
module.exports = {
  dependencyTypes: ["!local"],
  semverGroups: [
    {
      range: "",
      dependencyTypes: ["dev", "prod", "resolutions"],
      dependencies: ["**"],
      packages: ["**"],
    },
  ],
  versionGroups: [
    {
      dependencies: ["eslint", "@typescript-eslint/**"],
      isIgnored: true,
      label: "Nx isn't ready for eslint 9 upgrade yet.",
    },
    {
      dependencyTypes: ["peer"],
      specifierTypes: "range",
    },
    {
      dependencies: ["@types/**"],
      dependencyTypes: ["!dev"],
      isBanned: true,
      label: "@types packages should only be under devDependencies.",
    },
  ],
};
