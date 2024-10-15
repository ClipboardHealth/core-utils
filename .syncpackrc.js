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
