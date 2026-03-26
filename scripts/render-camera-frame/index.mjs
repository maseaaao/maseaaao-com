import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const OVERLAY_DIR = path.join(DIST_DIR, "overlays");
const OUTPUT_DIR = path.join(OVERLAY_DIR, "rendered");
const OVERLAY_FILE = path.join(OVERLAY_DIR, "camera-frame.html");
const OVERLAY_URL = "/overlays/camera-frame.html";
const WIDTH = 2560;
const HEIGHT = 1440;
const DURATION_SECONDS = 8;
const FPS = 30;
const FRAME_COUNT = DURATION_SECONDS * FPS;
const SCENE_TIMEOUT_MS = 15000;

async function main() {
  await assertDirectoryExists(DIST_DIR, "dist");
  await assertDirectoryExists(OVERLAY_DIR, "dist/overlays");
  await assertFileExists(OVERLAY_FILE, "dist/overlays/camera-frame.html");
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  const format = parseFormat(process.argv.slice(2));
  const edgeBinary = await resolveEdgeBinary();
  const server = await startStaticServer(DIST_DIR);
  let browser = null;
  let context = null;
  let page = null;

  try {
    browser = await chromium.launch({
      executablePath: edgeBinary,
      headless: true,
      args: ["--disable-gpu", "--force-device-scale-factor=1", "--hide-scrollbars"],
    });

    context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: WIDTH, height: HEIGHT },
    });

    page = await context.newPage();
    await page.goto(`${server.origin}${OVERLAY_URL}`, {
      waitUntil: "load",
      timeout: SCENE_TIMEOUT_MS,
    });
    await waitForSceneReady(page, SCENE_TIMEOUT_MS);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
      }
    });

    if (format === "png") {
      const outputPath = path.join(OUTPUT_DIR, "camera-frame.png");
      await setAnimationTime(page, DURATION_SECONDS * 1000 * 0.5);
      await page.screenshot({ path: outputPath });
      console.log(`[ok] camera-frame.html -> ${path.relative(REPO_ROOT, outputPath)}`);
    } else {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "maseaaao-camera-frame-")
      );

      try {
        const framesDir = path.join(tempDir, "frames");
        await fs.promises.mkdir(framesDir, { recursive: true });

        console.log(`Rendering ${FRAME_COUNT} frames at ${FPS} fps from ${OVERLAY_FILE}.`);

        for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
          const timeMs = (frameIndex / FPS) * 1000;
          await setAnimationTime(page, timeMs);

          const framePath = path.join(
            framesDir,
            `frame-${String(frameIndex).padStart(4, "0")}.png`
          );
          await page.screenshot({ path: framePath });

          if ((frameIndex + 1) % FPS === 0 || frameIndex === FRAME_COUNT - 1) {
            console.log(`  captured ${frameIndex + 1}/${FRAME_COUNT}`);
          }
        }

        const outputPath = path.join(OUTPUT_DIR, "camera-frame.webm");
        await encodeWebm(framesDir, outputPath);
        console.log(`[ok] camera-frame.html -> ${path.relative(REPO_ROOT, outputPath)}`);
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } finally {
    await Promise.allSettled([page?.close(), context?.close(), browser?.close(), closeServer(server.server)]);
  }
}

function parseFormat(argv) {
  const formatArg = argv.find((argument) => argument.startsWith("--format="));
  const format = formatArg ? formatArg.slice("--format=".length).toLowerCase() : "webm";

  if (format !== "webm" && format !== "png") {
    throw new Error(`Unsupported format "${format}". Use --format=webm or --format=png.`);
  }

  return format;
}

async function assertDirectoryExists(directoryPath, label) {
  let stats;

  try {
    stats = await fs.promises.stat(directoryPath);
  } catch {
    throw new Error(`Expected ${label} at ${directoryPath}, but it was not found.`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Expected ${label} at ${directoryPath}, but it is not a directory.`);
  }
}

async function assertFileExists(filePath, label) {
  let stats;

  try {
    stats = await fs.promises.stat(filePath);
  } catch {
    throw new Error(`Expected ${label} at ${filePath}, but it was not found.`);
  }

  if (!stats.isFile()) {
    throw new Error(`Expected ${label} at ${filePath}, but it is not a file.`);
  }
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        await handleStaticRequest(rootDir, request, response);
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end(`Internal server error: ${error.message}`);
      }
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.off("error", reject);
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        server,
      });
    });
  });
}

async function handleStaticRequest(rootDir, request, response) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed.");
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const filePath = resolveRequestPath(rootDir, url.pathname);

  if (!filePath) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden.");
    return;
  }

  let stats;

  try {
    stats = await fs.promises.stat(filePath);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES.get(extension) ?? "application/octet-stream";
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": String(stats.size),
    "content-type": contentType,
  });

  if (method === "HEAD") {
    response.end();
    return;
  }

  const bytes = await fs.promises.readFile(filePath);
  response.end(bytes);
}

function resolveRequestPath(rootDir, urlPath) {
  let relativePath;

  try {
    relativePath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  if (relativePath === "/" || relativePath === "") {
    relativePath = "/index.html";
  }

  if (relativePath.endsWith("/")) {
    relativePath = `${relativePath}index.html`;
  }

  const normalizedPath = path.normalize(relativePath.replace(/^[/\\]+/, ""));
  const absolutePath = path.resolve(rootDir, normalizedPath);
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;

  if (absolutePath !== rootDir && !absolutePath.startsWith(rootPrefix)) {
    return null;
  }

  return absolutePath;
}

async function resolveEdgeBinary() {
  const candidates = [];

  if (process.env.EDGE_BIN) {
    candidates.push(process.env.EDGE_BIN);
  }

  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    );
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
      return candidate;
    } catch {
      // Keep scanning candidates.
    }
  }

  const hint = process.env.EDGE_BIN ? ` EDGE_BIN=${process.env.EDGE_BIN}` : "";
  throw new Error(`Microsoft Edge binary not found.${hint}`.trim());
}

async function waitForSceneReady(page, timeoutMs) {
  await page.evaluate(async (timeout) => {
    const readyPromise = (async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timed out after ${timeout}ms waiting for scene to settle.`));
      }, timeout);
    });

    await Promise.race([readyPromise, timeoutPromise]);
  }, timeoutMs);
}

async function setAnimationTime(page, timeMs) {
  await page.evaluate((time) => {
    for (const animation of document.getAnimations()) {
      animation.currentTime = time;
    }
  }, timeMs);
}

async function encodeWebm(framesDir, outputPath) {
  await runCommand("ffmpeg", [
    "-y",
    "-framerate",
    String(FPS),
    "-i",
    path.join(framesDir, "frame-%04d.png"),
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "28",
    "-b:v",
    "0",
    "-deadline",
    "good",
    "-cpu-used",
    "4",
    "-row-mt",
    "1",
    outputPath,
  ]);
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${command} was not found on PATH.`));
        return;
      }

      reject(error);
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code ?? "<unknown>"}${signal ? ` signal ${signal}` : ""}.`
        )
      );
    });
  });
}

async function closeServer(server) {
  if (!server || !server.listening) {
    return;
  }

  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".webm", "video/webm"],
]);

main().catch((error) => {
  console.error(error.stack ?? error.message ?? String(error));
  process.exitCode = 1;
});

