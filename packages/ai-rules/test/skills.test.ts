import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PATHS } from "../scripts/constants";
import { parseFrontmatterDescription } from "../scripts/rules";

// A description is a retrieval trigger, not a spec: every session in every consuming repo pays for
// all of them, so adding a skill shouldn't quietly tax every repo that installs the package.
const MAX_DESCRIPTION_LENGTH = 200;

async function readSkillDescriptions(): Promise<Array<{ description: string; name: string }>> {
  const entries = await readdir(PATHS.skillsSource, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  return await Promise.all(
    names.map(async (name) => {
      const content = await readFile(path.join(PATHS.skillsSource, name, "SKILL.md"), "utf8");

      return { name, description: parseFrontmatterDescription(content) ?? "" };
    }),
  );
}

describe("skill descriptions", () => {
  let skills: Array<{ description: string; name: string }>;

  beforeAll(async () => {
    skills = await readSkillDescriptions();
  });

  it("are discoverable for every skill", () => {
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.filter((skill) => skill.description === "")).toStrictEqual([]);
  });

  it(`stay within ${MAX_DESCRIPTION_LENGTH} characters`, () => {
    const actual = skills
      .filter((skill) => skill.description.length > MAX_DESCRIPTION_LENGTH)
      .map((skill) => `${skill.name} (${skill.description.length})`);

    expect(actual).toStrictEqual([]);
  });
});
