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
