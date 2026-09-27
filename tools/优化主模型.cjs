// 安全压缩「主模型」（平时显示的着色/分割模型）：只做几何量化压缩
// （EXT_meshopt_compression / quantize）+ 各部件独立减面，绝不做 join / flatten
// （那样会合并部件，但主模型即便保留 12 段也无害，且与动作模型姿态一致、零视觉回退）。
// 输入：模型/吴昊阳模型原版.glb（经 optimize_glb 产出吴昊阳优化版.glb 后，再由本脚本产出吴昊阳主页版.glb）
// 之后由 tools/同步模型.cjs 把它同步为 public/model/model.glb。
// 纹理链：先调独立进程 compress_textures.cjs 把贴图压成 WebP（见 YH-002），
// KTX2 需要额外 basisu 转码依赖且 GitHub Pages 纯静态直出无转码服务，故只用 WebP + 文档说明，不硬引入不可用库。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { dedup, prune, resample, sparse, simplify, quantize } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require("meshoptimizer");

const 根目录 = path.join(__dirname, "..");
const 输入 = path.resolve(process.argv[2] || path.join(根目录, "模型", "吴昊阳优化版.glb"));
const 输出 = path.resolve(process.argv[3] || path.join(根目录, "模型", "吴昊阳主页版.glb"));
const 中间文件 = path.join(path.dirname(输出), "_中间_主模型纹理.glb");
const 纹理最大边 = Number(process.env.TEX_SIZE || 2048);
const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";

(async () => {
  if (!fs.existsSync(输入)) { console.error("× 找不到输入：", 输入); process.exit(1); }
  console.log("纹理压缩 → WebP（独立进程）");
  execFileSync(
    process.execPath,
    [path.join(__dirname, "compress_textures.cjs"), 输入, 中间文件, String(纹理最大边)],
    { stdio: "inherit" }
  );
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression]);
  io.registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder, "meshopt.simplifier": MeshoptSimplifier });

  const doc = await io.read(中间文件);
  fs.rmSync(中间文件, { force: true });
  const 输入前 = fs.statSync(输入).size;
  let 部件数 = 0;
  for (const m of doc.getRoot().listMeshes()) 部件数 += m.listPrimitives().length;
  console.log(`输入：${path.basename(输入)} ${兆(输入前)}，图元数=${部件数}`);

  await doc.transform(
    dedup(),
    resample(),
    prune({ keepLeaves: true }),
    sparse(),
    // 各部件独立减面到约 20%，把 53MB 主模型压到约 4.8MB；保留 12 段，零视觉回退。
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.01 })
  );

  const ext = doc.createExtension(EXTMeshoptCompression).setRequired(false).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });

  fs.mkdirSync(path.dirname(输出), { recursive: true });
  await io.write(输出, doc);
  const 大小 = fs.statSync(输出).size;
  let 输出部件数 = 0;
  for (const m of doc.getRoot().listMeshes()) 输出部件数 += m.listPrimitives().length;
  console.log(`输出：${path.relative(根目录, 输出)} ${兆(大小)}，图元数=${输出部件数}`);
  if (输出部件数 !== 部件数) {
    console.error(`× 部件数变了（${部件数} → ${输出部件数}）！`);
    process.exit(1);
  }
  console.log(`✔ 部件数一致（${部件数}），压缩率 ${((大小 / 输入前) * 100).toFixed(1)}%，节省 ${兆(输入前 - 大小)}`);
})().catch((e) => { try { fs.rmSync(中间文件, { force: true }); } catch {} console.error("压缩失败：", e); process.exit(1); });
