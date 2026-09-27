const fs = require("fs");
const path = process.argv[2];
const buf = fs.readFileSync(path);
console.log("文件大小(MB):", (buf.length / 1048576).toFixed(2));
const magic = buf.toString("ascii", 0, 4);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
console.log("magic:", magic, "version:", version, "declaredLength(MB):", (length / 1048576).toFixed(2));
let off = 12;
const chunks = [];
while (off < buf.length) {
  const cLen = buf.readUInt32LE(off);
  const cType = buf.readUInt32LE(off + 4);
  chunks.push({ len: cLen, type: cType, off });
  off += 8 + cLen;
}
for (const c of chunks) {
  const name = buf.toString("ascii", c.off + 4, c.off + 8);
  console.log("chunk", name, (c.len / 1048576).toFixed(2), "MB @", c.off);
  if (name.trim() === "JSON") {
    const text = buf.toString("utf8", c.off + 8, c.off + 8 + c.len).replace(/[ \t]+$/, "");
    const j = JSON.parse(text);
    const counts = (k) => (Array.isArray(j[k]) ? j[k].length : 0);
    console.log("--- JSON 统计 ---");
    for (const k of ["asset", "scene", "scenes", "nodes", "meshes", "materials", "textures", "images", "samplers", "animations", "accessors", "bufferViews", "buffers", "skins", "cameras", "lights", "extensionsUsed", "extensionsRequired"]) {
      const v = j[k];
      if (v === undefined) continue;
      if (Array.isArray(v)) console.log(k, "=", v.length);
      else if (typeof v === "object") console.log(k, "=", JSON.stringify(v));
      else console.log(k, "=", v);
    }
    console.log("--- images ---");
    (j.images || []).forEach((im, i) => console.log(i, im.uri ? im.uri.slice(0, 40) : "embedded", im.mimeType, im.width + "x" + im.height));
    console.log("--- animations ---");
    (j.animations || []).forEach((an, i) => {
      const chans = (an.channels || []).map((c) => (c.target || {}).path + ":" + (j.nodes && j.nodes[c.target.node] || {}).name).join(", ");
      console.log(i, "name=" + (an.name || "(无名)"), "sampler=" + (an.samplers || []).length, chans.slice(0, 200));
    });
    console.log("--- nodes (前40) ---");
    (j.nodes || []).slice(0, 40).forEach((n, i) => console.log(i, JSON.stringify(n).slice(0, 180)));
    console.log("--- meshes 顶点/面 估算 ---");
    (j.meshes || []).forEach((m, i) => {
      const prims = (m.primitives || []).map((p) => {
        const pos = j.accessors[p.attributes.POSITION];
        const idx = p.indices ? j.accessors[p.indices] : null;
        const 面 = idx ? idx.count / 3 : (pos ? pos.count / 3 : 0);
        return "prim:" + (j.materials && j.materials[p.material] ? (j.materials[p.material].name || p.material) : p.material) + " verts=" + (pos ? pos.count : 0) + " tris=" + 面;
      }).join(" | ");
      console.log(i, (m.name || "(无名)"), prims.slice(0, 200));
    });
    let totalTris = 0, totalVerts = 0;
    (j.meshes || []).forEach((m) => (m.primitives || []).forEach((p) => {
      const pos = j.accessors[p.attributes.POSITION];
      const idx = p.indices ? j.accessors[p.indices] : null;
      totalVerts += pos ? pos.count : 0;
      totalTris += idx ? idx.count / 3 : (pos ? pos.count / 3 : 0);
    }));
    console.log("总顶点:", totalVerts, "总三角面:", Math.round(totalTris));
    (j.accessors || []).forEach((a, i) => {
      if (a.type === "VEC3" && (a.min || a.max)) console.log("bbox accessor", i, JSON.stringify(a.min), JSON.stringify(a.max));
    });
  }
}
