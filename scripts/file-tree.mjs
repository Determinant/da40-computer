import { readdir } from "node:fs/promises";

export const collectRelativeFiles = async (directory, relativeDirectory = "") => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectRelativeFiles(
        new URL(`${entry.name}/`, directory),
        `${relativePath}/`,
      ));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
};
