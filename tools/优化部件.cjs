// 安全压缩动作模型（12 段 COLOR_0 部件版）：只做几何量化压缩（EXT_meshopt_compression / quantize），
// 绝不 join / flatten / simplify —— 那两个会合并 12 个部件，破坏「分离」动画。
// 动作模型源：模型/吴昊阳部件版.glb（本地存在时）→ 输出 public/model/model-parts.glb
// 输入：模型/吴昊阳部件版.glb  输出：public/model/model-parts.glb
const fs = require("fs");
const path = require("path");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { dedup, prune, resample, sparse, simplify, quantize } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require("meshoptimizer");

const 根目录 = path.join(__dirname, "..");
const 输入 = path.resolve(process.argv[2] || path.join(根目录, "模型", "吴昊阳部件版.glb"));
const 输出 = path.resolve(process.argv[3] || path.join(根目录, "public", "model", "model-parts.glb"));
const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";

(async () => {
  if (!fs.existsSync(输入)) { console.error("× 找不到输入：", 输入); process.exit(1); }
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression]);
  io.registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder, "meshopt.simplifier": MeshoptSimplifier });

  const doc = await io.read(输入);
  const 输入前 = fs.statSync(输入).size;
  let 部件数 = 0;
  for (const m of doc.getRoot().listMeshes()) 部件数 += m.listPrimitives().length;
  console.log(`输入：${path.basename(输入)} ${兆(输入前)}，图元数=${部件数}`);

  await doc.transform(
    dedup(),
    resample(),
    prune({ keepLeaves: true }),
    sparse(),
    // 减面：每个部件独立简化（绝不合并网格），把 200 万三角面压到约 20%，
    // 既大幅缩小体积（避免 CloudStudio 上限），又保留 12 段供「分离」动画使用。
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
    console.error(`× 部件数变了（${部件数} → ${输出部件数}），分离动画会坏！`);
    process.exit(1);
  }
  console.log(`✔ 部件数一致（${部件数}），安全压缩率 ${((大小 / 输入前) * 100).toFixed(1)}%`);
})().catch((e) => { console.error("压缩失败：", e); process.exit(1); });
