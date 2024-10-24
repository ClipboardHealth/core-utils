import { Dirent, promises } from "node:fs";
import { join } from "node:path";

const utf8: BufferEncoding = "utf8";
const readmePath = join(__dirname, "README.md");
const markers = {
  start: "<!-- START: auto-generated -->",
  end: "<!-- END: auto-generated -->",
};

async function updateReadme() {
  const [readme, dirNames] = await Promise.all([
    promises.readFile(readmePath, utf8),
    promises
      .readdir(join(__dirname, "packages"), { withFileTypes: true })
      .then((d) => d.filter((dirent) => dirent.isDirectory())),
  ]);

  const readmeLines = await Promise.all(
    dirNames.map(async (dirent) => {
      const path = join(__dirname, "packages", dirent.name, "package.json");
      const { description } = JSON.parse(await promises.readFile(path, utf8));
      return `- [${dirent.name}](./packages/${dirent.name}/README.md): ${description ?? ""}`;
    }),
  );

  const updatedReadme = readme.replace(
    new RegExp(`${markers.start}[\\s\\S]*${markers.end}`),
    `${markers.start}\n\n${readmeLines.join("\n")}\n\n${markers.end}`,
  );

  if (readme === updatedReadme) {
    console.log("No README file changes to '## Libraries' section.");
  } else {
    await promises.writeFile(readmePath, updatedReadme, utf8);
  }
}

updateReadme();
