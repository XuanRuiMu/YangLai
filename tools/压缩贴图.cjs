/**
 * 纹理压缩（独立进程，流水线第一棒）
 *
 * 必须独立运行：@gltf-transform/functions 会间接加载 ndarray-pixels，
 * 后者自带一份原生二进制损坏的嵌套 sharp，会把错误的 libvips DLL 注入进程，
 * 导致本进程内任何 sharp 调用报 "colourspace: parameter space not set"。
 * 本脚本只加载 core / extensions / sharp，绕开该依赖。
 *
 * 用法：node tools/压缩贴图.cjs <输入.glb> <输出.glb> [最大边长] [webp|avif]
 * 默认 webp（three GLTFLoader 对 EXT_texture_webp 支持最稳；avif 需浏览器解码，
 * 可用 TEX_FORMAT=avif 试压，失败自动回退 webp）。
 */
const fs = require("fs");
const path = require("path");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTTextureAVIF, EXTTextureWebP, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const sharp = require("sharp");

const 输入 = process.argv[2];
const 输出 = process.argv[3];
const 最大边 = Number(process.argv[4] || process.env.TEX_SIZE || 2048);
const 格式 = String(process.argv[5] || process.env.TEX_FORMAT || "webp").toLowerCase();
const 兆 = (n) => (n / 1048576).toFixed(2) + " MB";

function 取编码参数(名) {
  if (/normal/i.test(名)) return { quality: 93, effort: 5 };
  if (/metallic|roughness|occlusion|ao/i.test(名)) return { quality: 90, effort: 5 };
  return { quality: 84, effort: 5 };
}

async function 编码(管道, 参数, 回退新图) {
  if (格式 === "avif") {
    try {
      return await 管道.avif({ quality: Math.min(60, 参数.quality), effort: 4 }).toBuffer();
    } catch (错误) {
      console.warn(`  ! AVIF 不可用，回退 WebP：${错误.message}`);
      return 回退新图();
    }
  }
  return 回退新图();
}

(async () => {
  const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, EXTTextureAVIF, EXTTextureWebP, EXTMeshoptCompression]);
  const doc = await io.read(输入);

  const 纹理们 = doc.getRoot().listTextures();
  if (!纹理们.length) {
    console.log("  没有纹理，跳过");
    await io.write(输出, doc);
    return;
  }

  // 纹理 -> 用途，用于决定编码质量
  const 用途表 = new Map();
  for (const 材质 of doc.getRoot().listMaterials()) {
    const 映射 = [
      [材质.getBaseColorTexture(), "baseColor"],
      [材质.getNormalTexture(), "normal"],
      [材质.getMetallicRoughnessTexture(), "metallicRoughness"],
      [材质.getOcclusionTexture(), "occlusion"],
      [材质.getEmissiveTexture(), "emissive"],
    ];
    for (const [纹理, 用途] of 映射) {
      if (纹理) 用途表.set(纹理, (用途表.get(纹理) || "") + " " + 用途);
    }
  }

  let 前 = 0;
  let 后 = 0;
  for (const 纹理 of 纹理们) {
    const 原图 = Buffer.from(纹理.getImage());
    前 += 原图.length;
    const 用途 = 用途表.get(纹理) || "";
    const 参数 = 取编码参数(用途 + " " + (纹理.getName() || ""));
    try {
      const 元 = await sharp(原图).metadata();
      const 管道 = sharp(原图).resize(最大边, 最大边, { fit: "inside", withoutEnlargement: true });
      const 回退 = () => 管道.clone().webp({ quality: 参数.quality, effort: 参数.effort }).toBuffer();
      const 新图 = await 编码(管道, 参数, 回退);
      const 目标类型 = 格式 === "avif" ? "image/avif" : "image/webp";
      纹理.setImage(new Uint8Array(新图)).setMimeType(目标类型);
      后 += 新图.length;
      const 新元 = await sharp(新图).metadata();
      console.log(
        `  · ${(纹理.getName() || "?").slice(0, 34)} [${用途.trim()}] ${元.width}x${元.height} → ${新元.width}x${新元.height} q${参数.quality}  ${兆(原图.length)} → ${兆(新图.length)}`
      );
    } catch (错误) {
      console.warn(`  ! ${纹理.getName()} 压缩失败，保留原图：${错误.message}`);
      后 += 原图.length;
    }
  }

  fs.mkdirSync(path.dirname(输出), { recursive: true });
  await io.write(输出, doc);
  console.log(`  合计 ${兆(前)} → ${兆(后)}`);
})().catch((错误) => {
  console.error("纹理压缩失败：", 错误);
  process.exit(1);
});
