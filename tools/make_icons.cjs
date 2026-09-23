/**
 * 生成 PWA 图标。用 sharp 把一段 SVG 光栅化成 PNG。
 * 用法：node tools/make_icons.cjs
 * 产物：192 / 512（桌面+安卓）、180 / 167 / 152（苹果触控）、512-遮罩（maskable 安全区留白）、截图-宽/窄（manifest 截图位）。
 */
const path = require("path");
const sharp = require("sharp");

const 太阳图标 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a1030"/>
      <stop offset="0.55" stop-color="#160f20"/>
      <stop offset="1" stop-color="#3a1a10"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#ffd76a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffc53d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <circle cx="256" cy="215" r="205" fill="url(#glow)"/>
  <path d="M256 204c-40-34-96-30-124-6-30 26-22 78 16 100 34 20 76 20 108 8z" fill="#ffffff" opacity="0.55"/>
  <path d="M256 204c40-34 96-30 124-6 30 26 22 78-16 100-34 20-76 20-108 8z" fill="#ffffff" opacity="0.42"/>
  <ellipse cx="256" cy="300" rx="118" ry="96" fill="#ffc53d"/>
  <rect x="172" y="286" width="168" height="26" rx="13" fill="#2a1a00"/>
  <rect x="172" y="336" width="168" height="26" rx="13" fill="#2a1a00"/>
  <circle cx="200" cy="272" r="24" fill="#1b1020"/>
  <circle cx="312" cy="272" r="24" fill="#1b1020"/>
  <circle cx="207" cy="266" r="8" fill="#ffffff" opacity="0.9"/>
  <circle cx="319" cy="266" r="8" fill="#ffffff" opacity="0.9"/>
  <path d="M232 396c14 16 34 16 48 0" stroke="#2a1a00" stroke-width="14" fill="none" stroke-linecap="round"/>
</svg>`;

const 宽截图 = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#120d18"/><text x="640" y="330" font-size="120" text-anchor="middle">🌞</text><text x="640" y="480" font-size="64" fill="#ffc53d" text-anchor="middle">阳来直播间</text><text x="640" y="560" font-size="36" fill="#a99cbd" text-anchor="middle">双击点赞 · 拖拽道具 · 弹幕刷屏</text></svg>`;
const 窄截图 = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="#120d18"/><text x="195" y="360" font-size="120" text-anchor="middle">🌞</text><text x="195" y="500" font-size="56" fill="#ffc53d" text-anchor="middle">阳来直播间</text><text x="195" y="580" font-size="30" fill="#a99cbd" text-anchor="middle">双击点赞 · 拖拽道具</text></svg>`;

(async () => {
  const 目录 = path.join(__dirname, "..", "public", "icons");
  for (const 边长 of [152, 167, 180, 192, 512]) {
    const 出 = path.join(目录, `icon-${边长}.png`);
    await sharp(Buffer.from(太阳图标)).resize(边长, 边长).png({ compressionLevel: 9 }).toFile(出);
    console.log("已生成", 出);
  }
  const 遮罩 = await sharp(Buffer.from(太阳图标))
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
