import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { generateQrWithLogo } from "./generate-qr-with-logo.mjs";

const root = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(root, "dist", "assets");
const avatarPath = path.join(assetsDir, "avatar-master.png");
const logoPath = path.join(
  root,
  "src",
  "logo",
  "rendered",
  "maseaaao-dark.webp",
);
const qrUrl = "https://maseaaao.stream";

const palette = {
  ink: "#0f0b1a",
  surface: "#211734",
  lavender: "#dfc4ff",
  pink: "#ffc4de",
  mint: "#7de3d6",
  yellow: "#ffe08a",
  text: "#fbf7ff",
};

const svg = (width, height, content) =>
  Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${content}
  </svg>
`);

function spark(cx, cy, radius, fill, opacity = 1) {
  const inner = radius * 0.34;
  return `<path d="M ${cx} ${cy - radius} L ${cx + inner} ${cy - inner} L ${cx + radius} ${cy} L ${cx + inner} ${cy + inner} L ${cx} ${cy + radius} L ${cx - inner} ${cy + inner} L ${cx - radius} ${cy} L ${cx - inner} ${cy - inner} Z" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function backgroundSvg(width, height, options = {}) {
  const { rounded = 0, showMark = true } = options;
  const clip = rounded
    ? `<clipPath id="clip"><rect width="${width}" height="${height}" rx="${rounded}"/></clipPath>`
    : "";
  const mark = showMark
    ? `${spark(width * 0.13, height * 0.2, Math.min(width, height) * 0.045, palette.lavender, 0.82)}
       <path d="M ${width * 0.78} ${height * 0.76} l ${width * 0.035} ${height * 0.06} l -${width * 0.07} 0 Z" fill="none" stroke="${palette.mint}" stroke-width="${Math.max(2, Math.min(width, height) * 0.009)}" stroke-linejoin="round" opacity=".85"/>`
    : "";
  return svg(
    width,
    height,
    `
    <defs>
      ${clip}
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#0e0a18"/>
        <stop offset=".52" stop-color="#1a112b"/>
        <stop offset="1" stop-color="#100b1c"/>
      </linearGradient>
      <radialGradient id="lavender" cx=".2" cy=".14" r=".8"><stop stop-color="${palette.lavender}" stop-opacity=".47"/><stop offset="1" stop-color="${palette.lavender}" stop-opacity="0"/></radialGradient>
      <radialGradient id="pink" cx=".8" cy=".18" r=".75"><stop stop-color="${palette.pink}" stop-opacity=".35"/><stop offset="1" stop-color="${palette.pink}" stop-opacity="0"/></radialGradient>
      <radialGradient id="mint" cx=".5" cy="1" r=".8"><stop stop-color="${palette.mint}" stop-opacity=".24"/><stop offset="1" stop-color="${palette.mint}" stop-opacity="0"/></radialGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="${Math.max(10, Math.min(width, height) * 0.04)}"/></filter>
    </defs>
    <g ${rounded ? 'clip-path="url(#clip)"' : ""}>
      <rect width="${width}" height="${height}" fill="url(#base)"/>
      <circle cx="${width * 0.18}" cy="${height * 0.13}" r="${Math.min(width, height) * 0.36}" fill="url(#lavender)"/>
      <circle cx="${width * 0.84}" cy="${height * 0.18}" r="${Math.min(width, height) * 0.38}" fill="url(#pink)"/>
      <circle cx="${width * 0.48}" cy="${height * 1.02}" r="${Math.min(width, height) * 0.46}" fill="url(#mint)"/>
      <path d="M ${width * -0.12} ${height * 0.8} C ${width * 0.19} ${height * 0.5}, ${width * 0.37} ${height * 1.07}, ${width * 0.68} ${height * 0.72} S ${width * 1.04} ${height * 0.47}, ${width * 1.14} ${height * 0.36}" fill="none" stroke="${palette.pink}" stroke-opacity=".22" stroke-width="${Math.max(5, Math.min(width, height) * 0.025)}" filter="url(#blur)"/>
      <rect x="${Math.max(2, width * 0.03)}" y="${Math.max(2, height * 0.03)}" width="${width * 0.94}" height="${height * 0.94}" rx="${Math.max(rounded * 0.78, 4)}" fill="none" stroke="${palette.lavender}" stroke-opacity=".2" stroke-width="${Math.max(1, Math.min(width, height) * 0.003)}"/>
      ${mark}
    </g>
  `,
  );
}

async function avatarRounded(size, radius = Math.round(size * 0.25)) {
  const image = await sharp(avatarPath)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const mask = svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/>`,
  );
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function avatarCircle(size) {
  const image = await sharp(avatarPath)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  const mask = svg(
    size,
    size,
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>`,
  );
  return sharp(image)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function makeAppIcon(size) {
  const inset = Math.round(size * 0.13);
  const portraitSize = size - inset * 2;
  const portrait = await avatarRounded(
    portraitSize,
    Math.round(portraitSize * 0.27),
  );
  const overlay = svg(
    size,
    size,
    `
    ${spark(size * 0.17, size * 0.2, size * 0.06, palette.text, 0.9)}
    <circle cx="${size * 0.81}" cy="${size * 0.75}" r="${size * 0.032}" fill="${palette.yellow}"/>
    <rect x="${inset - Math.max(2, size * 0.008)}" y="${inset - Math.max(2, size * 0.008)}" width="${portraitSize + Math.max(4, size * 0.016)}" height="${portraitSize + Math.max(4, size * 0.016)}" rx="${portraitSize * 0.28}" fill="none" stroke="${palette.lavender}" stroke-opacity=".88" stroke-width="${Math.max(2, size * 0.012)}"/>
  `,
  );
  return sharp(
    backgroundSvg(size, size, {
      rounded: Math.round(size * 0.22),
      showMark: false,
    }),
  )
    .composite([
      { input: portrait, left: inset, top: inset },
      { input: overlay },
    ])
    .png()
    .toBuffer();
}

async function writeAppIcons() {
  const names = [
    ["android-chrome-512x512.png", 512],
    ["apple-touch-icon.png", 180],
    ["apple-touch-icon-1024x1024.png", 1024],
    ["favicon-16x16.png", 16],
    ["favicon-32x32.png", 32],
    ["favicon-48x48.png", 48],
  ];
  const iconBuffers = new Map();
  for (const [name, size] of names) {
    const output = await makeAppIcon(size);
    iconBuffers.set(size, output);
    await writeFile(path.join(root, "dist", name), output);
  }
  const icoSizes = [16, 32, 48];
  const entries = icoSizes.map((size) => iconBuffers.get(size));
  const directory = Buffer.alloc(6 + entries.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(entries.length, 4);
  let offset = directory.length;
  entries.forEach((entry, index) => {
    const size = icoSizes[index];
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(entry.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += entry.length;
  });
  await writeFile(
    path.join(root, "dist", "favicon.ico"),
    Buffer.concat([directory, ...entries]),
  );
}

async function writeQrCode() {
  // Генератор сам подбирает безопасный размер плитки в модулях и перед записью
  // проверяет читаемость декодированием (scripts/generate-qr-with-logo.mjs).
  const { buffer: finished } = await generateQrWithLogo({
    text: qrUrl,
    width: 800,
    logo: await sharp(avatarPath).toBuffer(),
  });
  await sharp(finished)
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toFile(path.join(assetsDir, "maseaaao.stream.jpeg"));
}

async function writeSocialImages() {
  const ogWidth = 1200;
  const ogHeight = 630;
  const portrait = await avatarRounded(500, 94);
  const wordmark = await sharp(logoPath)
    .resize({ width: 500, fit: "inside" })
    .png()
    .toBuffer();
  const text = svg(
    ogWidth,
    ogHeight,
    `
    <text x="90" y="366" fill="${palette.lavender}" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="3">LIVE · TWITCH · YOUTUBE</text>
    <path d="M 90 410 H 445" stroke="${palette.mint}" stroke-width="5" stroke-linecap="round"/>
    ${spark(462, 266, 20, palette.yellow, 0.9)}
  `,
  );
  await sharp(backgroundSvg(ogWidth, ogHeight, { rounded: 0, showMark: false }))
    .composite([
      { input: wordmark, left: 84, top: 174 },
      { input: portrait, left: 640, top: 80 },
      { input: text },
    ])
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(path.join(root, "dist", "og-image.jpg"));

  await sharp(backgroundSvg(1024, 1024, { rounded: 92, showMark: true }))
    .png()
    .toFile(path.join(assetsDir, "subscribe-background-ai.png"));
}

await mkdir(assetsDir, { recursive: true });
await Promise.all([writeAppIcons(), writeQrCode(), writeSocialImages()]);
console.log("Generated brand assets, QR code, and social images.");
