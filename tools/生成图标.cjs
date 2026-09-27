/**
 * 生成 PWA 图标。用 sharp 把一段 SVG 光栅化成 PNG。
 * 用法：node tools/生成图标.cjs
 * 产物：192 / 512（桌面+安卓）、180 / 167 / 152（苹果触控）、512-遮罩（maskable 安全区留白）、截图-宽/窄（manifest 截图位）。
 */
const path = require("path");
const sharp = require("sharp");

const 太羊图标 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a1030"/>
      <stop offset="0.55" stop-color="#160f20"/>
      <stop offset="1" stop-color="#1a2a10"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#fff3d6" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#e8f0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <circle cx="256" cy="215" r="205" fill="url(#glow)"/>
  <ellipse cx="256" cy="292" rx="128" ry="118" fill="#f4f6ff"/>
  <ellipse cx="256" cy="292" rx="104" ry="96" fill="#ffffff"/>
  <path d="M168 176c-22-38-8-72 18-84 20-9 40-2 50 14z" fill="#f4f6ff"/>
  <path d="M344 176c22-38 8-72-18-84-20-9-40-2-50 14z" fill="#f4f6ff"/>
  <path d="M178 168c-14-26-5-50 12-58 13-6 27-1 34 10z" fill="#e8ddcf"/>
  <path d="M334 168c14-26 5-50-12-58-13-6-27-1-34 10z" fill="#e8ddcf"/>
  <path d="M148 250c-26-8-40-30-36-52 3-17 18-28 34-26z" fill="#f4f6ff"/>
  <path d="M364 250c26-8 40-30 36-52-3-17-18-28-34-26z" fill="#f4f6ff"/>
  <circle cx="214" cy="282" r="26" fill="#1b1020"/>
  <circle cx="298" cy="282" r="26" fill="#1b1020"/>
  <circle cx="222" cy="274" r="9" fill="#ffffff" opacity="0.95"/>
  <circle cx="306" cy="274" r="9" fill="#ffffff" opacity="0.95"/>
  <path d="M236 344c6 10 12 14 20 14s14-4 20-14" stroke="#2a1a00" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="188" cy="322" r="14" fill="#ffb3c1" opacity="0.65"/>
  <circle cx="324" cy="322" r="14" fill="#ffb3c1" opacity="0.65"/>
  <path d="M256 372c-8 14-24 20-40 16M256 372c8 14 24 20 40 16" stroke="#f4f6ff" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.8"/>
</svg>`;

const 宽截图 = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#120d18"/><text x="640" y="330" font-size="120" text-anchor="middle">🐑</text><text x="640" y="480" font-size="64" fill="#ffc53d" text-anchor="middle">羊来直播间</text><text x="640" y="560" font-size="36" fill="#a99cbd" text-anchor="middle">双击点赞 · 拖拽道具 · 弹幕刷屏</text></svg>`;
const 窄截图 = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="#120d18"/><text x="195" y="360" font-size="120" text-anchor="middle">🐑</text><text x="195" y="500" font-size="56" fill="#ffc53d" text-anchor="middle">羊来直播间</text><text x="195" y="580" font-size="30" fill="#a99cbd" text-anchor="middle">双击点赞 · 拖拽道具</text></svg>`;

(async () => {
  const 目录 = path.join(__dirname, "..", "public", "icons");
  for (const 边长 of [152, 167, 180, 192, 512]) {
    const 出 = path.join(目录, `icon-${边长}.png`);
    await sharp(Buffer.from(太羊图标)).resize(边长, 边长).png({ compressionLevel: 9 }).toFile(出);
    console.log("已生成", 出);
  }
  const 遮罩 = await sharp(Buffer.from(太羊图标))
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#160f20" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(遮罩).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(目录, "icon-512-遮罩.png"));
  console.log("已生成 icon-512-遮罩.png");
  await sharp(Buffer.from(宽截图)).png({ compressionLevel: 9 }).toFile(path.join(目录, "截图-宽.png"));
  await sharp(Buffer.from(窄截图)).png({ compressionLevel: 9 }).toFile(path.join(目录, "截图-窄.png"));
  console.log("已生成 manifest 截图位");
})();
