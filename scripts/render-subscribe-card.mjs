import sharp from "sharp";

const background = "dist/assets/subscribe-background-ai.png";
const logo = "dist/logo/rendered/maseaaao-dark.png";
const output = "dist/assets/subscribe-512.png";
const youtube = "dist/assets/youtube-simpleicons.svg";
const twitch = "dist/assets/twitch-simpleicons.svg";
const telegram = "dist/assets/telegram-simpleicons.svg";

const overlay = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="title" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8D1FF"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-30%" width="140%" height="170%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/><feOffset dy="7"/><feComponentTransfer><feFuncA type="linear" slope=".7"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <text x="256" y="177" text-anchor="middle" fill="url(#title)" font-family="Arial, sans-serif" font-size="55" font-weight="900" letter-spacing="-1" filter="url(#shadow)">ПОДПИШИСЬ</text>
    <path d="M129 204h254" stroke="#DCC8FF" stroke-opacity=".58" stroke-width="2" stroke-linecap="round"/>
    <g filter="url(#glow)" fill="#0C0B2A" fill-opacity=".72" stroke="#DCC8FF" stroke-opacity=".66" stroke-width="1.5">
      <circle cx="148" cy="239" r="29"/>
      <circle cx="256" cy="239" r="29"/>
      <circle cx="364" cy="239" r="29"/>
    </g>
  </svg>
`);

const logoImage = await sharp(logo).resize({ width: 374 }).png().toBuffer();
const youtubeIcon = await sharp(youtube).resize(42, 42).png().toBuffer();
const twitchIcon = await sharp(twitch).resize(36, 36).png().toBuffer();
const telegramIcon = await sharp(telegram).resize(42, 42).png().toBuffer();
await sharp(background)
  .resize(512, 512, { fit: "cover", position: "centre" })
  .composite([
    { input: overlay, top: 0, left: 0 },
    { input: youtubeIcon, top: 218, left: 127 },
    { input: twitchIcon, top: 221, left: 238 },
    { input: telegramIcon, top: 218, left: 343 },
    { input: logoImage, top: 367, left: 69 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output);

console.log(`Rendered ${output}`);
