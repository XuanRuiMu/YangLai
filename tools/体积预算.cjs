/**
 * 构建体积预算门禁：解析 vite 构建产物清单，按配置阈值卡首屏与单包体积。
 * 纯前端 Pages 产物只读检查，不改部署形态。
 * 用法：node tools/体积预算.cjs [dist目录]
 */
const fs = require("fs");
const path = require("path");

const 根目录 = path.join(__dirname, "..");
const 产物目录 = process.argv[2] || path.join(根目录, "dist");

function 读配置预算() {
  const 内容 = fs.readFileSync(path.join(根目录, "src", "配置.js"), "utf-8");
  const 首屏 = 内容.match(/首屏包预算字节\s*:\s*(\d+)/);
  const 单包 = 内容.match(/单包预算字节\s*:\s*(\d+)/);
  return {
    首屏: 首屏 ? Number(首屏[1]) : 1048576,
    单包: 单包 ? Number(单包[1]) : 838860,
  };
}

function 列产物(目录, 收 = []) {
  for (const 名 of fs.readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    const 信息 = fs.statSync(全);
    if (信息.isDirectory()) {
      列产物(全, 收);
      continue;
    }
    if (/\.br$/.test(名)) {
      收.push({ 文件: path.relative(产物目录, 全), 字节: 信息.size, 压缩: true });
      continue;
    }
    if (/\.(js|css|html)(\.gz)?$/.test(名)) 收.push({ 文件: path.relative(产物目录, 全), 字节: 信息.size });
  }
  return 收;
}

const 预算 = 读配置预算();
const 全部 = 列产物(产物目录);
const 产物 = 全部.filter((项) => !项.压缩 && /^(assets[\\/]|sw\.js$)/.test(项.文件));
const 首屏包 = 产物.filter((项) => !/\.(gz|br)$/.test(项.文件));
const 首屏字节 = 首屏包.reduce((和, 项) => 和 + 项.字节, 0);
const 超包 = 首屏包.filter((项) => 项.字节 > 预算.单包);

console.log(`首屏 JS+CSS 合计 ${(首屏字节 / 1024).toFixed(1)} KB（预算 ${(预算.首屏 / 1024).toFixed(0)} KB）`);
for (const 项 of [...首屏包].sort((a, b) => b.字节 - a.字节)) {
  console.log(`  · ${项.文件} ${(项.字节 / 1024).toFixed(1)} KB`);
}
let 失败 = 0;
if (首屏字节 > 预算.首屏) {
  console.error(`× 首屏超预算：${首屏字节} > ${预算.首屏}`);
  失败 = 1;
}
for (const 项 of 超包) {
  console.error(`× 单包超预算：${项.文件} ${项.字节} > ${预算.单包}`);
  失败 = 1;
}
const 有压缩 = 全部.some((项) => /\.gz$/.test(项.文件));
if (!有压缩) {
  console.error("× 缺少 .gz 预压缩产物（vite-plugin-compression 未生效）");
  失败 = 1;
}
try {
  const br测 = require("child_process").spawnSync("node", ["-e", "require('zlib').brotliCompressSync(Buffer.from('x'))"]);
  if (br测.status !== 0) console.log("· 注：本机 zlib 无 brotli，.br 由托管压缩补足，仅要求 .gz");
} catch {
}
console.log(失败 ? "× 体积预算未通过" : "✔ 体积预算通过");
process.exit(失败);
