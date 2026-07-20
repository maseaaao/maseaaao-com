import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const outputDir = "dist/twitch/emotes";
const xxlSource = join(outputDir, "pink-mascot-sheet-source-XXL.png");
const fallbackSource = join(outputDir, "pink-mascot-sheet-source.png");
const names = [
  "follower-hype", "follower-lol", "follower-love", "follower-rage", "follower-sleep",
  "sub1-cheer", "sub1-gg", "sub1-sip", "sub1-think", "sub1-wave",
  "sub1-animated-bounce", "sub1-animated-hype", "sub1-animated-love", "sub1-animated-rage", "sub1-animated-wow",
  "sub2-crown", "sub3-legend", "bits-1000", "bits-5000", "bits-10000",
];
const sizes = [28, 56, 112, 512];
const grid = { columns: 5, rows: 4 };
const cellInset = 8;

async function firstExistingPath(...paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next source.
    }
  }
  throw new Error("No source sheet was found.");
}

function removeChromaKey(data) {
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const distance = Math.hypot(red, green - 255, blue);
    const greenDominant = green > 45 && green > red * 1.15 && green > blue * 1.15;

    if (greenDominant || distance <= 24) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    } else if (distance < 92) {
      data[index + 1] = Math.min(green, Math.max(red, blue));
      data[index + 3] = Math.round(255 * ((distance - 24) / 68));
    }
  }
}

sharp.cache(false);
const source = await firstExistingPath(xxlSource, fallbackSource);
const input = await readFile(source);
const metadata = await sharp(input).metadata();

if (!metadata.width || !metadata.height) {
  throw new Error(`Expected a ${grid.columns}×${grid.rows} sprite sheet: ${source}`);
}

const cells = [];

for (let index = 0; index < names.length; index += 1) {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  const left = Math.floor((column * metadata.width) / grid.columns);
  const right = Math.floor(((column + 1) * metadata.width) / grid.columns);
  const top = Math.floor((row * metadata.height) / grid.rows);
  const bottom = Math.floor(((row + 1) * metadata.height) / grid.rows);
  const { data, info } = await sharp(input)
    .extract({
      left: left + cellInset,
      top: top + cellInset,
      width: right - left - cellInset * 2,
      height: bottom - top - cellInset * 2,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  removeChromaKey(data);
  cells.push({
    name: names[index],
    image: await sharp(data, { raw: info })
      .trim({ background: { r: 0, g: 255, b: 0, alpha: 0 } })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  });
}

for (const { name, image } of cells) {
  for (const size of sizes) {
    await sharp(image)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 100 })
      .toFile(join(outputDir, `${name}-${size}.png`));
  }
}

const manifest = {
  source: "pink-mascot-sheet-source.png",
  groups: {
    followers: names.slice(0, 5),
    subscriberTier1: names.slice(5, 10),
    subscriberTier1AnimatedKeyframes: names.slice(10, 15),
    subscriberTier2: names.slice(15, 16),
    subscriberTier3: names.slice(16, 17),
    bits: names.slice(17),
  },
};
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Rendered ${names.length} generated emotes × ${sizes.length} sizes to PNG.`);
