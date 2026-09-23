/**
 * 主页模型压缩（GitHub Pages 承载友好档）
 *
 * 目标：把 public/model 下三个模型压到 Pages 首屏能舒服承载的体积，同时不破坏运行时依赖的结构：
 *   · 保留节点名（world / part_0..part_11，动作系统按名取部件）
 *   · 保留图元数（动作模型必须是 12 段，不能 join / flatten）
 *   · 保留 COLOR_0（动作态着色用）与贴图链（base / normal / metallicRoughness）
 *
 * 流水线（沿用既有三棒设计，几何与纹理必须分进程，详见 optimize_glb.cjs 注释）：
 *   ① 解压中间体（meshopt → 未压缩 glb，供纹理进程读取）
 *   ② 纹理降分辨率 + WebP（compress_textures.cjs 独立进程）
 *   ③ 减面 → 量化 → meshopt FILTER 编码
 *
 * 用法：node tools/compress_pages.cjs
 * 可选环境变量：RATIO（默认 0.5）、ERROR（默认 0.002）、TEX（默认 1024）
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { dedup, prune, quantize, simplify, unpartition } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require("meshoptimizer");

const 根目录 = path.join(__dirname, "..");
const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";
const 比例 = Number(process.env.RATIO || 0.5);
const 误差 = Number(process.env.ERROR || 0.002);
const 纹理边 = Number(process.env.TEX || 1024);

const 任务表 = [
  { 文件: path.join(根目录, "public", "model", "model.glb"), 纹理: 纹理边 },
  { 文件: path.join(根目录, "public", "model", "model-lite.glb"), 纹理: 纹理边 },
  { 文件: path.join(根目录, "public", "model", "model-parts.glb"), 纹理: 0 },
];

function 建IO(带解码器) {
  const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression]);
  return 带解码器
    ? io.registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder })
    : io.registerDependencies({ "meshopt.encoder": MeshoptEncoder });
}

function 快照(doc) {
  let 顶点 = 0;
  let 三角 = 0;
  let 图元 = 0;
  for (const 网格 of doc.getRoot().listMeshes()) {
    for (const 图 of 网格.listPrimitives()) {
      图元++;
      顶点 += 图.getAttribute("POSITION").getCount();
      const 索引 = 图.getIndices();
      三角 += 索引 ? 索引.getCount() / 3 : 顶点 / 3;
    }
  }
  return { 图元, 三角: Math.round(三角), 节点: doc.getRoot().listNodes().map((n) => n.getName()).join("|") };
}

async function 解压到中间体(文件, 中间1) {
  const io = 建IO(true);
  const doc = await io.read(文件);
  for (const 扩展 of doc.getRoot().listExtensionsUsed()) {
    if (扩展.extensionName === "EXT_meshopt_compression") 扩展.dispose();
  }
  await doc.transform(unpartition());
  await io.write(中间1, doc);
}

async function 压缩一个({ 文件, 纹理 }) {
  const 名 = path.basename(文件);
  const 原始大小 = fs.statSync(文件).size;
  const 中间1 = path.join(根目录, "tools", `_中间1_${名}`);
  const 中间2 = path.join(根目录, "tools", `_中间2_${名}`);
  const 中间3 = path.join(根目录, "tools", `_中间3_${名}`);
  try {
    await 解压到中间体(文件, 中间1);
    let 几何输入 = 中间1;
    if (纹理 > 0) {
      console.log(`  · 纹理 → WebP（最大边 ${纹理}）`);
      execFileSync(process.execPath, [path.join(__dirname, "compress_textures.cjs"), 中间1, 中间2, String(纹理)], {
        stdio: "inherit",
      });
      几何输入 = 中间2;
    }

    const io = 建IO(false);
    const doc = await io.read(几何输入);
    const 前 = 快照(doc);
    await doc.transform(
      dedup(),
      simplify({ simplifier: MeshoptSimplifier, ratio: 比例, error: 误差 }),
      quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }),
      prune({ keepAttributes: false, keepIndices: false, keepLeaves: false, keepSolidTextures: false }),
      unpartition()
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(false).setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.FILTER,
    });
    await io.write(中间3, doc);

    // 校验：结构必须与压缩前完全一致，否则不替换
    const 复查 = await 建IO(true).read(中间3);
    const 后 = 快照(复查);
    if (后.图元 !== 前.图元 || 后.节点 !== 前.节点) {
      console.error(`× ${名} 结构被破坏：图元 ${前.图元}→${后.图元}，节点一致=${后.节点 === 前.节点}`);
      process.exit(1);
    }

    const 新大小 = fs.statSync(中间3).size;
    fs.copyFileSync(中间3, 文件);
    console.log(
      `✔ ${名}  ${兆(原始大小)} → ${兆(新大小)}（${((新大小 / 原始大小) * 100).toFixed(1)}%）  三角 ${前.三角} → ${后.三角}  图元 ${后.图元}`
    );
  } finally {
    for (const f of [中间1, 中间2, 中间3]) fs.rmSync(f, { force: true });
  }
}

(async () => {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  console.log(`主页模型压缩：减面比例 ${比例}，误差 ${误差}，纹理最大边 ${纹理边 || "不变"}`);
  for (const 任务 of 任务表) await 压缩一个(任务);
  console.log("──────────────────────────────");
  const 合计 = 任务表.reduce((和, t) => 和 + fs.statSync(t.文件).size, 0);
  console.log(`三个模型合计 ${兆(合计)}`);
})().catch((错误) => {
  console.error("压缩失败：", 错误);
  process.exit(1);
});
