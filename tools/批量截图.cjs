/**
 * 模型朝向取证：加载 dist 页面 → 停自动旋转 → 切「全身正面」机位截图 → 切「背面偷拍」机位截图。
 *
 * 用法：node tools/批量截图.cjs [端口]
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require("playwright");

const 端口 = Number(process.argv[2] || 4179);
const 根目录 = path.join(__dirname, "..", "dist");
const 输出目录 = path.join(__dirname, "_shots");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

function 起服务() {
  const 服务 = http.createServer((请求, 响应) => {
    let 路径名 = decodeURIComponent(请求.url.split("?")[0]);
    if (路径名 === "/") 路径名 = "/index.html";
    const 文件 = path.join(根目录, path.normalize(路径名).replace(/^(\.\.[/\\])+/, ""));
    if (!文件.startsWith(根目录) || !fs.existsSync(文件) || fs.statSync(文件).isDirectory()) {
      响应.writeHead(404).end("404");
      return;
    }
    const 类型 = MIME[path.extname(文件).toLowerCase()] || "application/octet-stream";
    响应.writeHead(200, { "Content-Type": 类型, "Content-Length": fs.statSync(文件).size });
    fs.createReadStream(文件).pipe(响应);
  });
  return new Promise((完成) => 服务.listen(端口, () => 完成(服务)));
}

const 等 = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

(async () => {
  if (!fs.existsSync(path.join(根目录, "index.html"))) {
    console.error("× 没有 dist，请先 npm run build");
    process.exit(1);
  }
  fs.mkdirSync(输出目录, { recursive: true });

  const 服务 = await 起服务();
  const 浏览器 = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const 页 = await (await 浏览器.newContext({ viewport: { width: 900, height: 1100 } })).newPage();
  页.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));

  await 页.goto(`http://127.0.0.1:${端口}/`, { waitUntil: "load", timeout: 60000 });
  await 页.waitForSelector("#加载罩.隐藏", { timeout: 180000 });
  await 页.click("#取名跳");
  await 等(800);
  await 页.evaluate(() => {
    document.querySelector("#新手引导")?.classList.add("隐藏");
    const 罩 = document.querySelector("#新手引导");
    if (罩) 罩.dataset.引导停 = "1";
  }).catch(() => {});

  const 基线性能 = await 页.evaluate(() => {
    const 资源 = performance.getEntriesByType("resource");
    const 首屏字节 = 资源
      .filter((项) => /\.(js|css)(\?|$)/.test(项.name))
      .reduce((和, 项) => 和 + (项.transferSize || 项.encodedBodySize || 0), 0);
    return { 首屏字节, 长任务: performance.getEntriesByType("longtask").length, 输入延迟: -1 };
  });
  console.log(`· 基线性能：首屏JS+CSS ${(基线性能.首屏字节 / 1024).toFixed(0)} KB，长任务 ${基线性能.长任务} 个，输入延迟 ${基线性能.输入延迟}ms`);

  // 停自动旋转，避免截图时模型转到别的角度
  await 页.click('.控制[data-act="spin"]');
  await 等(600);

  // 第 1 次点机位 → 序号 0 = 全身正面
  await 页.click('.控制[data-act="camera"]');
  console.log("· 等待正面机位缓动到位…");
  await 等(22000);
  await 页.screenshot({ path: path.join(输出目录, "朝向-正面机位.png") });
  console.log("✔ 正面机位截图完成");

  // 再点 4 次 → 序号 4 = 背面偷拍
  for (let i = 0; i < 4; i++) {
    await 页.click('.控制[data-act="camera"]');
    await 等(400);
  }
  console.log("· 等待背面机位缓动到位…");
  await 等(22000);
  await 页.screenshot({ path: path.join(输出目录, "朝向-背面机位.png") });
  console.log("✔ 背面机位截图完成");

  const 看门狗 = setTimeout(() => process.exit(0), 6000);
  看门狗.unref?.();
  try {
    await Promise.race([浏览器.close(), 等(4000)]);
  } catch {}
  try {
    服务.closeAllConnections?.();
    服务.close();
  } catch {}
  process.exit(0);
})().catch((错误) => {
  console.error("截图脚本崩了：", 错误);
  process.exit(1);
});
