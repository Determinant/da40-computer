import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const startingPort = Number.parseInt(process.env.DA40_PORT ?? "8000", 10);
const lastPort = startingPort + 10;
let port = startingPort;
const outputDirectory = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/da40.html" : requestUrl.pathname);
    const filePath = resolve(outputDirectory, `.${pathname}`);

    if (!filePath.startsWith(`${outputDirectory}${sep}`) || !(await stat(filePath)).isFile()) {
      response.writeHead(404).end("Not found\n");
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found\n");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < lastPort) {
    const occupiedPort = port;
    port += 1;
    console.warn(`Port ${occupiedPort} is already in use; trying ${port}.`);
    server.listen(port, host);
    return;
  }

  console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`DA40 Computer is running at http://${host}:${port}/da40.html`);
});
