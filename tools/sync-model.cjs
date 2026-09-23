/**
 * 把优化后的模型同步到 public/ 下，改用纯 ASCII 路径和文件名，
 * 避免中文路径在某些静态托管上被 URL 编码后 404。
 *
 * dev / build 之前都会跑，找不到优化版就退回原始模型。
 * 同步后写 public/model/model-manifest.json（content-hash + 体积清单），
 * 运行时优先读清单拿多候选路径，清单缺失则回退到配置写死的候选路径。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const 根目录 = path.join(__dirname, "..");
const 候选 = [
  // 待机（平时）用「带印花的压缩主模型」：从 武哲锋.glb 压缩而来，保留 base/normal/MR 三张 WebP 贴图，
  // 9.44MB，正是"平时该看到的着色模型"。绝不再把无贴图的分割模型当待机模型。
  path.join(根目录, "模型", "优化版.glb"),
  path.join(根目录, "模型", "武哲锋模型分割版_压缩.glb"),
  path.join(根目录, "模型", "武哲锋模型分割版.glb"),
];
const 目标目录 = path.join(根目录, "public", "model");
const 目标 = path.join(目标目录, "model.glb");

const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";

const 来源 = 候选.find((p) => fs.existsSync(p));
if (!来源) {
  if (!fs.existsSync(目标)) {
    console.error("× 找不到模型：", 候选.join(" 或 "), "，且 public/model/model.glb 也不存在");
    process.exit(1);
  }
  console.warn(`! 模型/ 下没有源模型，沿用已压缩就位的 public/model/model.glb（${兆(fs.statSync(目标).size)}）`);
}

fs.mkdirSync(目标目录, { recursive: true });

if (来源) {
  const 目标已是最新 = (() => {
    if (!fs.existsSync(目标)) return false;
    const a = fs.statSync(来源);
    const b = fs.statSync(目标);
    return a.size === b.size && a.mtimeMs <= b.mtimeMs;
  })();

  if (!目标已是最新) {
    fs.copyFileSync(来源, 目标);
    console.log(`✔ 模型同步：${path.basename(来源)} → public/model/model.glb（${兆(fs.statSync(目标).size)}）`);
  } else {
    console.log(`· 模型已是最新（${兆(fs.statSync(目标).size)}），跳过同步`);
  }

  if (来源.includes("武哲锋") && !候选[0].includes("武哲锋")) {
    console.warn("! 用的是未优化的原始模型，先跑 npm run 模型:优化 会小很多");
  }
}

/* ── 动作用的分割模型：确保 public/model/model-parts.glb 存在 ──
 * 动作模型必须是「带顶点色的分割压缩版」(武哲锋模型分割版_压缩.glb)，它带有 COLOR_0，
 * 切到动作时才显示颜色，而不是被涂成陶土。若被误删，从该源兜底拷贝。 */
const 部件源 = path.join(根目录, "模型", "武哲锋模型分割版_压缩.glb");
const 部件目标 = path.join(目标目录, "model-parts.glb");
if (fs.existsSync(部件源)) {
  if (!fs.existsSync(部件目标) || fs.statSync(部件源).mtimeMs > fs.statSync(部件目标).mtimeMs) {
    fs.copyFileSync(部件源, 部件目标);
    console.log(`✔ 动作模型兜底同步：${path.basename(部件源)} → public/model/model-parts.glb（${兆(fs.statSync(部件目标).size)}）`);
  } else {
    console.log(`· 动作模型已是最新（${兆(fs.statSync(部件目标).size)}），跳过同步`);
  }
} else if (!fs.existsSync(部件目标)) {
  console.warn("! 找不到动作模型源文件，model-parts.glb 缺失，动作功能将不可用");
}

/* ── 轻量模型：确保 public/model/model-lite.glb 存在（手机/弱网自动切换用） ── */
const 轻量源 = path.join(根目录, "模型", "轻量版.glb");
const 轻量目标 = path.join(目标目录, "model-lite.glb");
if (fs.existsSync(轻量源)) {
  if (!fs.existsSync(轻量目标) || fs.statSync(轻量源).mtimeMs > fs.statSync(轻量目标).mtimeMs) {
    fs.copyFileSync(轻量源, 轻量目标);
    console.log(`✔ 轻量模型同步：${path.basename(轻量源)} → public/model/model-lite.glb（${兆(fs.statSync(轻量目标).size)}）`);
  } else {
    console.log(`· 轻量模型已是最新（${兆(fs.statSync(轻量目标).size)}），跳过同步`);
  }
} else if (!fs.existsSync(轻量目标)) {
  console.warn("! 找不到轻量模型源文件，model-lite.glb 缺失，弱网将回退到高模");
}

/* ── 内容哈希清单：运行时多候选用，缺失则回退配置候选路径 ── */
function 取哈希(文件) {
  const 流 = fs.readFileSync(文件);
  return crypto.createHash("sha256").update(流).digest("hex").slice(0, 16);
}

const 清单 = { 主: "model/model.glb", 低: null, 哈希: {}, 体积: {} };
for (const [键, 文件] of [["主", 目标], ["动作", 部件目标], ["低", 轻量目标]]) {
  if (fs.existsSync(文件)) {
    const 名 = `model/${path.basename(文件)}`;
    清单.哈希[名] = 取哈希(文件);
    清单.体积[名] = fs.statSync(文件).size;
    if (键 === "低") 清单.低 = 名;
  }
}
fs.writeFileSync(path.join(目标目录, "model-manifest.json"), JSON.stringify(清单, null, 2));
console.log(`✔ 模型清单已写 public/model/model-manifest.json（主 ${清单.哈希["model/model.glb"] || "缺失"}）`);
