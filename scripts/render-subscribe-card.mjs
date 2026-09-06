import sharp from "sharp";

const background = "dist/assets/subscribe-background-ai.png";
const avatar = "dist/assets/avatar-master.png";
const logo = "src/logo/rendered/maseaaao-dark.webp";
const output = "dist/assets/subscribe-512.png";

const overlay = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="title" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FBF7FF"/><stop offset="1" stop-color="#DFC4FF"/></linearGradient>
    </defs>
    <rect x="34" y="32" width="444" height="448" rx="54" fill="#100B1A" fill-opacity=".58" stroke="#DFC4FF" stroke-opacity=".3"/>
    <text x="256" y="83" text-anchor="middle" fill="url(#title)" font-family="Arial, sans-serif" font-size="38" font-weight="900" letter-spacing="2">ПОДПИШИСЬ</text>
    <path d="M125 106H387" stroke="#7DE3D6" stroke-opacity=".72" stroke-width="3" stroke-linecap="round"/>
    <g fill="#DFC4FF"><path d="M256 104l8 20 20 8-20 8-8 20-8-20-20-8 20-8z"/></g>
    <g fill="#FFC4DE"><circle cx="147" cy="336" r="9"/><circle cx="365" cy="336" r="9"/></g>
    <text x="256" y="371" text-anchor="middle" fill="#C9BFD7" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">TWITCH · YOUTUBE · TELEGRAM</text>
  </svg>
`);

const avatarImage = await sharp(avatar)
  .resize(184, 184, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();
const avatarMask = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184"><circle cx="92" cy="92" r="92" fill="#fff"/></svg>',
);
const portrait = await sharp(avatarImage)
  .composite([{ input: avatarMask, blend: "dest-in" }])
  .png()
  .toBuffer();
const logoImage = await sharp(logo).resize({ width: 286 }).png().toBuffer();
await sharp(background)
  .resize(512, 512, { fit: "cover", position: "centre" })
  .composite([
    { input: overlay, top: 0, left: 0 },
    { input: portrait, top: 132, left: 164 },
    { input: logoImage, top: 406, left: 113 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);

console.log(`Rendered ${output}`);
