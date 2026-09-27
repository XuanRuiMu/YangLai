/**
 * 模型优化流水线：几何简化 + meshopt 压缩，再调起独立进程压缩纹理。
 *
 * 为什么纹理要另起进程：@gltf-transform/functions 会间接加载 ndarray-pixels，
 * 后者自带一份原生二进制损坏的嵌套 sharp，会把错误的 libvips DLL 注入当前进程，
 * 使进程内任何 sharp 调用报 "colourspace: parameter space not set"。
 * 因此几何（需要 functions）与纹理（需要 sharp）必须分开跑。
 *
 * 用法：node tools/优化模型.cjs [输入.glb] [输出.glb]
 * 环境变量：TEX_SIZE(默认2048) SIMPLIFY_RATIO(默认0.3) SIMPLIFY_ERROR(默认0.0004)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { dedup, weld, simplify, flatten, join, prune, resample, sparse } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptSimplifier } = require("meshoptimizer");

const 输入 = process.argv[2] || "模型/吴昊阳模型原版.glb";
const 输出 = process.argv[3] || "模型/吴昊阳优化版.glb";
const 中间文件 = path.join(path.dirname(输出), "_中间_仅纹理.glb");
const 纹理最大边 = Number(process.env.TEX_SIZE || 2048);
const 简化比例 = Number(process.env.SIMPLIFY_RATIO || 0.3);
const 简化误差 = Number(process.env.SIMPLIFY_ERROR || 0.0004);
const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";

function 统计(doc) {
  let 顶点 = 0;
  let 三角 = 0;
  for (const 网格 of doc.getRoot().listMeshes()) {
    for (const 图元 of 网格.listPrimitives()) {
      顶点 += 图元.getAttribute("POSITION").getCount();
      const 索引 = 图元.getIndices();
      三角 += 索引 ? 索引.getCount() / 3 : 顶点 / 3;
    }
  }
  return { 顶点, 三角: Math.round(三角) };
}

(async () => {
  const 起始 = Date.now();
  const 输入大小 = fs.statSync(输入).size;
  console.log(`输入：${输入} ${兆(输入大小)}`);

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression]);
  io.registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  // 第一棒：纹理在干净进程里压（未压缩的几何，读写都无需 meshopt 解码器）
  console.log("纹理压缩 → WebP（独立进程）");
  execFileSync(
    process.execPath,
    [path.join(__dirname, "compress_textures.cjs"), 输入, 中间文件, String(纹理最大边)],
    { stdio: "inherit" }
  );

  console.log("读取中…");
  const doc = await io.read(中间文件);
  const 原来 = 统计(doc);
  console.log(`原始：顶点 ${原来.顶点.toLocaleString()}，三角面 ${原来.三角.toLocaleString()}`);

  console.log("几何优化：dedup → flatten → join → weld → simplify");
  await doc.transform(
    dedup(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 简化比例, error: 简化误差 }),
    resample(),
    prune({ keepAttributes: false, keepIndices: false, keepLeaves: false, keepSolidTextures: false }),
    sparse()
  );
  const 简化后 = 统计(doc);
  console.log(
    `简化后：顶点 ${简化后.顶点.toLocaleString()}，三角面 ${简化后.三角.toLocaleString()}（保留 ${(
      (简化后.三角 / 原来.三角) * 100
    ).toFixed(1)}%）`
  );

  console.log("几何压缩 → EXT_meshopt_compression");
  doc.createExtension(EXTMeshoptCompression).setRequired(false).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });

  fs.mkdirSync(path.dirname(输出), { recursive: true });
  await io.write(输出, doc);
  fs.rmSync(中间文件, { force: true });

  const 输出大小 = fs.statSync(输出).size;
  console.log("──────────────────────────────");
  console.log(`输出：${输出} ${兆(输出大小)}`);
  console.log(`压缩率：${((输出大小 / 输入大小) * 100).toFixed(1)}%（省下 ${兆(输入大小 - 输出大小)}）`);
  console.log(`耗时：${((Date.now() - 起始) / 1000).toFixed(1)}s`);
})().catch((错误) => {
  console.error("优化失败：", 错误);
  process.exit(1);
});
