import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const outputDir = "dist/twitch/badges";
const sizes = [18, 36, 72];

const tiers = [
  { slug: "base", name: "Базовый", start: "#b4a6ff", end: "#6d50e8", glow: "#9f8bff", mark: "" },
  { slug: "2-months", name: "2 месяца", start: "#a2efff", end: "#5b94ff", glow: "#7fe0ff", mark: '<circle cx="48" cy="15" r="3.5" fill="#f7fdff"/>' },
  { slug: "3-months", name: "3 месяца", start: "#bdf4ff", end: "#936eff", glow: "#8edbff", mark: '<path d="M40 16 48 10l8 6-8 5z" fill="#f8fcff"/>' },
  { slug: "6-months", name: "6 месяцев", start: "#d3a8ff", end: "#ff7fb5", glow: "#d790ff", mark: '<path d="M36 17 42 11l6 6 6-6 6 6-6 5H42z" fill="#fff9ff"/>' },
  { slug: "9-months", name: "9 месяцев", start: "#ffc0d9", end: "#ff607e", glow: "#ff8bb8", mark: '<path d="M33 18 39 11l9 7 9-7 6 7-6 5H39z" fill="#fff8fb"/>' },
  { slug: "1-year", name: "1 год", start: "#fff1af", end: "#ff93b9", glow: "#ffd777", mark: '<path d="M29 19 35 11l7 6 6-9 6 9 7-6 6 8-6 6H35z" fill="#fffdf2"/>' },
];

const svg = (content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">${content}</svg>`;

function badge(tier) {
  const id = `tier-${tier.slug}`;
  return svg(`
    <defs>
      <linearGradient id="${id}-fill" x1="22" y1="13" x2="78" y2="85" gradientUnits="userSpaceOnUse">
        <stop stop-color="${tier.start}"/>
        <stop offset="1" stop-color="${tier.end}"/>
      </linearGradient>
      <linearGradient id="${id}-shine" x1="27" y1="17" x2="69" y2="75" gradientUnits="userSpaceOnUse">
        <stop stop-color="#fff" stop-opacity=".72"/>
        <stop offset=".55" stop-color="#fff" stop-opacity=".08"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feFlood flood-color="${tier.glow}" flood-opacity=".6"/>
        <feComposite in2="blur" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#${id}-glow)">
      <path d="M48 7 76 18 89 46 78 74 48 89 18 74 7 46 20 18Z" fill="${tier.glow}" opacity=".36"/>
      <path d="M48 9 74 20 86 47 75 73 48 87 21 73 10 47 22 20Z" fill="url(#${id}-fill)" stroke="#F8FAFF" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M48 13 70 23 79 47 70 67 48 81 26 67 17 47 26 23Z" fill="url(#${id}-shine)" opacity=".85"/>
    </g>
    <path d="m27 61 8-26 13 14 13-14 8 26-10-7-11 15-11-15Z" fill="#090B16" fill-opacity=".82"/>
    <path d="m31 58 5-17 12 13 12-13 5 17-7-5-10 14-10-14Z" fill="#F8FAFF"/>
    <path d="m38 53 10-12 10 12-10 14Z" fill="${tier.glow}" opacity=".92"/>
    ${tier.mark}
  `);
}

function decorationLevel2() {
  return svg(`
    <defs>
      <linearGradient id="deco-two" x1="17" y1="15" x2="80" y2="77" gradientUnits="userSpaceOnUse">
        <stop stop-color="#7fe0ff"/><stop offset=".52" stop-color="#9f8bff"/><stop offset="1" stop-color="#ff8bb8"/>
      </linearGradient>
      <filter id="deco-two-glow" x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur stdDeviation="3.2" result="blur"/>
        <feFlood flood-color="#9f8bff" flood-opacity=".75"/>
        <feComposite in2="blur" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#deco-two-glow)" stroke="url(#deco-two)" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 57C11 28 30 11 53 13c15 1 25 11 29 23" stroke-width="4"/>
      <path d="M13 62c-2-4-2-9 0-14M83 44c3 5 3 11 0 16" stroke-width="3" opacity=".85"/>
      <path d="m18 32 3 7 7 3-7 3-3 7-3-7-7-3 7-3zM77 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#F8FAFF" stroke-width="1.5"/>
    </g>
  `);
}

function decorationLevel3() {
  return svg(`
    <defs>
      <linearGradient id="deco-three" x1="13" y1="15" x2="86" y2="82" gradientUnits="userSpaceOnUse">
        <stop stop-color="#b8f5ff"/><stop offset=".48" stop-color="#b497ff"/><stop offset="1" stop-color="#ff8bb8"/>
      </linearGradient>
      <filter id="deco-three-glow" x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur stdDeviation="3.6" result="blur"/>
        <feFlood flood-color="#c09cff" flood-opacity=".8"/>
        <feComposite in2="blur" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#deco-three-glow)" stroke="url(#deco-three)" stroke-linecap="round" stroke-linejoin="round">
      <path d="M48 7 54 18l10-8-1 14 14-2-10 11 13 5-15 5" stroke-width="3.6"/>
      <path d="M48 7 42 18l-10-8 1 14-14-2 10 11-13 5 15 5" stroke-width="3.6"/>
      <path d="M17 50c-4 9-2 19 6 27M79 50c4 9 2 19-6 27" stroke-width="3" opacity=".9"/>
      <path d="m48 10 3 8 8 3-8 3-3 8-3-8-8-3 8-3zM17 69l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM79 69l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FCFAFF" stroke-width="1.4"/>
    </g>
  `);
}

async function render(name, markup) {
  await writeFile(join(outputDir, `${name}.svg`), markup, "utf8");
  for (const size of sizes) {
    await sharp(Buffer.from(markup), { density: 288 })
      .resize(size, size)
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 100 })
      .toFile(join(outputDir, `${name}-${size}.png`));
  }
}

await mkdir(outputDir, { recursive: true });
for (const tier of tiers) await render(`subscriber-${tier.slug}`, badge(tier));
await render("decoration-level-2", decorationLevel2());
await render("decoration-level-3", decorationLevel3());

const readme = "# Twitch badges\n\nКаждый значок сначала сохранён как SVG-исходник, затем отрендерен в PNG 18, 36 и 72 px — размеры для загрузки в Twitch. PNG имеют прозрачный фон.\n\n- subscriber-base — базовый уровень\n- subscriber-2-months … subscriber-1-year — уровни подписки\n- decoration-level-2 и decoration-level-3 — прозрачные украшения поверх значка\n";
await writeFile(join(outputDir, "README.md"), readme, "utf8");
