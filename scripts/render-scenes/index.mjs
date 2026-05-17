import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const DEFAULT_BASE_WIDTH = 2560;
const DEFAULT_BASE_HEIGHT = 1440;
const DEFAULT_CAPTURE_FORMAT = "webp";
const DEFAULT_CAPTURE_QUALITY = 100;
const SCENE_TIMEOUT_MS = 20000;
const SCRIPT_PATH = path.resolve(process.argv[1] ?? "scripts/render-scenes/index.mjs");
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const options = parseCliOptions(process.argv.slice(2));
const BASE_WIDTH = readPositiveIntegerOption(options.width, "--width", DEFAULT_BASE_WIDTH);
const BASE_HEIGHT = readPositiveIntegerOption(options.height, "--height", DEFAULT_BASE_HEIGHT);
const CAPTURE_FORMAT = readCaptureFormatOption(options.format);
const CAPTURE_QUALITY = readScreenshotQualityOption(options.quality, "--quality", DEFAULT_CAPTURE_QUALITY);
const SCENES_DIR = resolveRepoPath(options.scenesDir ?? "dist/scenes");
const OUTPUT_DIR = options.outputDir
  ? resolveRepoPath(options.outputDir)
  : path.join(SCENES_DIR, "rendered");

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
]);

async function main() {
  await assertDirectoryExists(DIST_DIR, "dist");
  assertPathInside(DIST_DIR, SCENES_DIR, "Scenes directory");
  await assertDirectoryExists(SCENES_DIR, path.relative(REPO_ROOT, SCENES_DIR));
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  const scenes = await discoverScenes();
  if (scenes.length === 0) {
    throw new Error(`No HTML scenes found in ${SCENES_DIR}.`);
  }

  const edgeBinary = await resolveEdgeBinary();
  let server = null;
  let browser = null;
  let context = null;
  let failures = 0;

  try {
    server = await startStaticServer(DIST_DIR);
    browser = await chromium.launch({
      executablePath: edgeBinary,
      headless: true,
      args: ["--disable-gpu", "--force-device-scale-factor=1", "--hide-scrollbars"],
    });
    context = await browser.newContext({
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      viewport: { width: BASE_WIDTH, height: BASE_HEIGHT },
    });

    console.log(`Serving ${DIST_DIR} at ${server.origin}`);
    console.log(`Using Edge: ${edgeBinary}`);
    console.log(`Rendering ${path.relative(REPO_ROOT, SCENES_DIR)} at ${BASE_WIDTH}x${BASE_HEIGHT}`);

    for (const scene of scenes) {
      const page = await context.newPage();

      try {
        const sceneUrl = `${server.origin}${scene.urlPath}`;
        await page.goto(sceneUrl, { waitUntil: "load", timeout: SCENE_TIMEOUT_MS });
        await waitForSceneReady(page, SCENE_TIMEOUT_MS);
        await page.waitForTimeout(250);

        const outputPath = path.join(OUTPUT_DIR, `${scene.basename}.${CAPTURE_FORMAT}`);
        const bytes = await captureScreenshot(page);
        await writeAtomically(outputPath, bytes);
        console.log(`[ok] ${scene.fileName} -> ${path.relative(REPO_ROOT, outputPath)}`);
      } catch (error) {
        failures += 1;
        console.error(`[fail] ${scene.fileName}: ${formatError(error)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await Promise.allSettled([context?.close(), browser?.close(), closeServer(server?.server)]);
  }

  if (failures > 0) {
    console.error(`Finished with ${failures} failed scene(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Rendered ${scenes.length} scene(s) to ${path.relative(REPO_ROOT, OUTPUT_DIR)}.`);
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

async function discoverScenes() {
  const entries = await fs.promises.readdir(SCENES_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".html")
    .map((entry) => ({
      basename: path.basename(entry.name, ".html"),
      fileName: entry.name,
      urlPath: toUrlPath(path.relative(DIST_DIR, path.join(SCENES_DIR, entry.name))),
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName, "en"));
}

function parseCliOptions(args) {
  const aliases = new Map([
    ["height", "height"],
    ["format", "format"],
    ["output-dir", "outputDir"],
    ["quality", "quality"],
    ["scenes-dir", "scenesDir"],
    ["width", "width"],
  ]);
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const separatorIndex = arg.indexOf("=");
    const rawKey = arg.slice(2, separatorIndex === -1 ? undefined : separatorIndex);
    const key = aliases.get(rawKey);
    if (!key) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    let value = separatorIndex === -1 ? undefined : arg.slice(separatorIndex + 1);
    if (value === undefined) {
      index += 1;
      value = args[index];
    }

    if (!value || value.startsWith("--")) {
      throw new Error(`Expected a value for --${rawKey}.`);
    }

    parsed[key] = value;
  }

  return parsed;
}

function readPositiveIntegerOption(value, label, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function readCaptureFormatOption(value) {
  if (value === undefined) {
    return DEFAULT_CAPTURE_FORMAT;
  }

  const normalized = value.toLowerCase();
  if (normalized === "jpeg" || normalized === "png" || normalized === "webp") {
    return normalized;
  }

  throw new Error("--format must be one of: jpeg, png, webp.");
}

function readScreenshotQualityOption(value, label, fallback) {
  const parsed = readPositiveIntegerOption(value, label, fallback);

  if (parsed > 100) {
    throw new Error(`${label} must be between 1 and 100.`);
  }

  return parsed;
}

function resolveRepoPath(value) {
  if (path.isAbsolute(value)) {
    return path.resolve(value);
  }

  return path.resolve(REPO_ROOT, value);
}

function assertPathInside(rootDir, candidatePath, label) {
  const relativePath = path.relative(rootDir, candidatePath);

  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return;
  }

  throw new Error(`${label} must be inside ${path.relative(REPO_ROOT, rootDir)}.`);
}

function toUrlPath(relativePath) {
  const segments = relativePath.split(path.sep).map((segment) => encodeURIComponent(segment));
  return `/${segments.join("/")}`;
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
    const requiredFonts = ["Geologica", "Onest"];

    const waitForImages = async () => {
      const imagePromises = Array.from(document.images, (image) => {
        const finalizeDecode = () => {
          if (typeof image.decode === "function") {
            return image.decode().catch(() => {});
          }

          return Promise.resolve();
        };

        if (image.complete) {
          if (image.naturalWidth === 0) {
            throw new Error(`Image failed to load: ${image.currentSrc || image.src || "<unknown>"}`);
          }

          return finalizeDecode();
        }

        return new Promise((resolve, reject) => {
          const cleanup = () => {
            image.removeEventListener("load", handleLoad);
            image.removeEventListener("error", handleError);
          };

          const handleLoad = () => {
            cleanup();
            resolve();
          };

          const handleError = () => {
            cleanup();
            reject(new Error(`Image failed to load: ${image.currentSrc || image.src || "<unknown>"}`));
          };

          image.addEventListener("load", handleLoad, { once: true });
          image.addEventListener("error", handleError, { once: true });
        }).then(finalizeDecode);
      });

      await Promise.all(imagePromises);
    };

    const readyPromise = (async () => {
      await document.fonts.ready;
      await waitForImages();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const missingFonts = requiredFonts.filter((fontFamily) => {
        return !document.fonts.check(`16px "${fontFamily}"`);
      });

      if (missingFonts.length > 0) {
        throw new Error(`Required fonts not ready: ${missingFonts.join(", ")}`);
      }
    })();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timed out after ${timeout}ms waiting for fonts and images.`));
      }, timeout);
    });

    await Promise.race([readyPromise, timeoutPromise]);
  }, timeoutMs);
}

async function captureScreenshot(page) {
  const session = await page.context().newCDPSession(page);
  const screenshotOptions = {
    captureBeyondViewport: false,
    format: CAPTURE_FORMAT,
    fromSurface: true,
  };

  if (CAPTURE_FORMAT !== "png") {
    screenshotOptions.quality = CAPTURE_QUALITY;
  }

  try {
    const { data } = await session.send("Page.captureScreenshot", screenshotOptions);

    return Buffer.from(data, "base64");
  } finally {
    await session.detach().catch(() => {});
  }
}

async function writeAtomically(destinationPath, bytes) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const tempPath = `${destinationPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempPath, bytes);

  try {
    await fs.promises.rename(tempPath, destinationPath);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") {
      throw error;
    }

    await fs.promises.rm(destinationPath, { force: true });
    await fs.promises.rename(tempPath, destinationPath);
  }
}

async function closeServer(server) {
  if (!server || !server.listening) {
    return;
  }

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function formatError(error) {
  if (!error || typeof error.message !== "string") {
    return "Unknown error.";
  }

  return error.message.split("\n")[0];
}

await main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
