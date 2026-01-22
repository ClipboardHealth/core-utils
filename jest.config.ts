// oxlint-disable-next-line no-var-requires
const { getJestProjectsAsync } = require("@nx/jest");

module.exports = async () => ({
  projects: await getJestProjectsAsync(),
});
