/**
 * SW 预缓存注入：vite 构建后把 dist 产物清单（含 hashed JS/CSS）写入 dist/sw.js。
 * 只改 dist 产物，不改部署形态；public/sw.js 保留 __壳资源__ 占位供下次构建替换。
 * 用法：node tools/注入离线缓存.cjs [dist目录]
 */
const fs = require("fs");
const path = require("path");

const 根目录 = path.join(__dirname, "..");
const 产物目录 = process.argv[2] || path.join(根目录, "dist");

function 读数(源码, 名, 回退) {
  const 匹配 = 源码.match(new RegExp(`${名}\\s*:\\s*(\\d+)`));
  return 匹配 ? Number(匹配[1]) : 回退;
}

function 列出(目录, 根, 收 = []) {
  for (const 名 of fs.readdirSync(目录)) {
    if (名.endsWith(".gz") || 名.endsWith(".br") || 名 === "sw.js") continue;
    const 全 = path.join(目录, 名);
    const 信息 = fs.statSync(全);
    if (信息.isDirectory()) {
      列出(全, 根, 收);
      continue;
    }
    const 相对 = path.relative(根, 全).replace(/\\/g, "/");
    if (/\.glb$/i.test(名)) continue;
    if (/^assets\//.test(相对) && !/\.(js|css|woff2?)$/i.test(名)) continue;
    if (/^(robots\.txt|sitemap\.xml|404\.html|privacy\.html|terms\.html)$/.test(名)) {
      收.push(`./${相对}`);
      continue;
    }
    收.push(`./${相对}`);
  }
  return 收;
}

const 模板 = fs.readFileSync(path.join(根目录, "public", "sw.js"), "utf-8");
if (!模板.includes("__壳资源__")) {
  console.error("× public/sw.js 缺少 __壳资源__ 占位，拒绝注入");
  process.exit(1);
}
const 配置源码 = fs.readFileSync(path.join(根目录, "src", "配置.js"), "utf-8");
const 音频条数 = 读数(配置源码, "音频最多条数", 40);
const 音频字节 = 读数(配置源码, "音频最多字节", 1048576);

const 基础 = ["./", "./index.html", "./manifest.webmanifest"];
const 产物 = 列出(产物目录, 产物目录).filter((项) => !基础.includes(项));
const 清单 = [...基础, ...[...new Set(产物)].sort()];
const 生成 = 模板
  .replace("const 壳资源 = __壳资源__;", `const 壳资源 = ${JSON.stringify(清单, null, 2)};`)
  .replace("const 音频最多条数 = __音频最多条数__;", `const 音频最多条数 = ${音频条数};`)
  .replace("const 音频最多字节 = __音频最多字节__;", `const 音频最多字节 = ${音频字节};`);
if (/__壳资源__|__音频最多条数__|__音频最多字节__/.test(生成.slice(生成.indexOf("const 版本")))) {
  console.error("× SW 仍有未替换占位");
  process.exit(1);
}
fs.writeFileSync(path.join(产物目录, "sw.js"), 生成, "utf-8");
{
  let 首页 = fs.readFileSync(path.join(产物目录, "index.html"), "utf-8");
  const 改前 = 首页;
  首页 = 首页.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="index.html" />');
  if (首页 !== 改前) fs.writeFileSync(path.join(产物目录, "index.html"), 首页, "utf-8");
}
console.log(`✔ SW 预缓存已注入 ${清单.length} 项（含 hashed assets）`);
