// 勘察 GLB 模型结构：节点树、是否多部件网格、是否带骨骼、是否有动画、各部件世界位置
globalThis.self = globalThis;
const 路径 = process.argv[2];
if (!路径) { console.error("用法: node tools/体检模型清单.cjs <模型.glb>"); process.exit(1); }

const fs = require("fs");

(async () => {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");

  const buf = fs.readFileSync(路径);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  console.log("=== 文件:", 路径, (buf.length / 1048576).toFixed(2) + "MB ===");

  const 加载器 = new GLTFLoader();
  加载器.setMeshoptDecoder(MeshoptDecoder);

  const 完成 = (gltf) => {
    const 场景 = gltf.scene;
    场景.updateMatrixWorld(true);
    let 网格数 = 0;
    const 部件 = [];
    场景.traverse((o) => {
      if (o.isMesh) {
        网格数++;
        let 顶点 = 0;
        try { 顶点 = o.geometry.attributes.position?.count || 0; } catch {}
        const 盒 = new THREE.Box3().setFromObject(o);
        const 中心 = 盒.getCenter(new THREE.Vector3());
        部件.push({ 名: o.name || "(无)", 顶点, x: +中心.x.toFixed(3), y: +中心.y.toFixed(3), z: +中心.z.toFixed(3) });
      }
    });
    console.log("网格(mesh)数量:", 网格数);
    console.log("动画(animation)数量:", gltf.animations.length);
    gltf.animations.forEach((a, i) => console.log(`  动画[${i}] ${a.name || "(无名)"} 时长=${a.duration.toFixed(2)}s 轨道数=${a.tracks.length}`));

    const 骨 = [];
    场景.traverse((o) => { if (o.isBone) 骨.push(o.name); });
    console.log("骨骼(bone)数量:", 骨.length, 骨.slice(0, 50).join(", "));

    console.log("--- 各部件（按世界 Y 从高到低，y 即身高方向）---");
    部件.sort((a, b) => b.y - a.y).forEach((p) => console.log(`  ${p.名.padEnd(28)} 顶点=${String(p.顶点).padStart(7)}  x=${p.x}  y=${p.y}  z=${p.z}`));

    // 详细：每个部件的世界包围盒 + 父节点名 + 节点本地位置（用于设计肢体关节枢轴）
    console.log("--- 部件包围盒 min/max（世界系，y 向上）---");
    const 详情 = [];
    场景.traverse((o) => {
      if (!o.isMesh) return;
      const 盒 = new THREE.Box3().setFromObject(o);
      const 尺寸 = 盒.getSize(new THREE.Vector3());
      详情.push({ 名: o.name, 父: o.parent?.name || "(root)", 尺寸: 尺寸, 盒 });
    });
    详情.sort((a, b) => b.盒.max.y - a.盒.max.y).forEach((d) => {
      const b = d.盒;
      console.log(`  ${d.名.padEnd(10)} 父=${String(d.父).padEnd(10)} 尺寸=(${d.尺寸.x.toFixed(2)},${d.尺寸.y.toFixed(2)},${d.尺寸.z.toFixed(2)})`);
      console.log(`      min=(${b.min.x.toFixed(3)},${b.min.y.toFixed(3)},${b.min.z.toFixed(3)}) max=(${b.max.x.toFixed(3)},${b.max.y.toFixed(3)},${b.max.z.toFixed(3)})`);
    });

    process.exit(0);
  };

  const 失败 = (err) => {
    console.error("PARSE ERROR:", err?.message || err);
    try {
      const txt = buf.toString("utf8", 12);
      const j = JSON.parse(txt.slice(txt.indexOf("{")));
      console.log("--- 回退：原始 JSON 节点数:", (j.nodes || []).length, "网格数:", (j.meshes || []).length, "骨骼数:", (j.skins || []).length);
    } catch (e) {}
    process.exit(2);
  };

  加载器.parse(ab, "", 完成, 失败);

  setTimeout(() => { console.error("超时（可能卡在纹理解码，结构信息已在上方输出）"); process.exit(0); }, 25000);
})();
