import { cp, mkdir } from "node:fs/promises";

const publicDirectory = new URL("../public/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);

await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });
