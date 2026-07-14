import { mkdir, readdir } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const inputDir = "dist/twitch/points";
const sizes = [28, 56, 112];

await mkdir(inputDir, { recursive: true });

const entries = await readdir(inputDir, { withFileTypes: true });
const sources = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith("-source.png"))
  .map((entry) => join(inputDir, entry.name))
  .sort((left, right) => left.localeCompare(right, "en"));

if (sources.length === 0) {
  throw new Error(`No PNG source files found in ${inputDir}. Expected names ending in -source.png.`);
}

for (const source of sources) {
  const { name } = parse(source);
  const outputName = name.replace(/-source$/, "");
  const image = await sharp(source).ensureAlpha().png().toBuffer();

  for (const size of sizes) {
    await sharp(image)
      .resize(size, size, { fit: "contain", withoutEnlargement: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 100 })
      .toFile(join(inputDir, `${outputName}-${size}.png`));
  }
}

console.log(`Rendered ${sources.length} Twitch point icon(s) × ${sizes.length} sizes to PNG.`);
