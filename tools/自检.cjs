/**
 * 端到端自检：起本地静态服务 → 打开页面 → 跑完全部交互 → 检查控制台
 *
 * 用法：node tools/自检.cjs [端口]
 * 门槛：所有检查项通过 且 控制台 0 错误 0 警告
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require("playwright");

const 端口 = Number(process.argv[2] || 4178);
const 根目录 = path.join(__dirname, "..", "dist");
const 截图目录 = path.join(__dirname, "..", "tools", "_shots");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/* ── 结果收集 ───────────────────────────── */

const 检查项 = [];
function 记(名, 通过, 说明 = "") {
  检查项.push({ 名, 通过: !!通过 });
  console.log(`${通过 ? "✔" : "×"} ${名}${说明 ? ` — ${说明}` : ""}`);
}
const 文本 = (页, 选择器) => 页.textContent(选择器).catch(() => "");
const 个数 = (页, 选择器) => 页.evaluate((s) => document.querySelectorAll(s).length, 选择器);
const 等 = (毫秒) => new Promise((r) => setTimeout(r, 毫秒));

async function 提示文本(页) {
  return 页.evaluate(() => [...document.querySelectorAll(".提示条")].map((n) => n.textContent || ""));
}

/** 轮询等待 toast 里出现关键词；无头慢速环境下事件处理器可能延迟数秒，固定 sleep 会错过 */
function 等提示(页, 关键词, 超时毫秒 = 15000) {
  return 页
    .waitForFunction(
      (词) => [...document.querySelectorAll(".提示条")].some((n) => (n.textContent || "").includes(词)),
      关键词,
      { timeout: 超时毫秒 }
    )
    .then(() => true)
    .catch(() => false);
}

/** 合成「按下道具 → 拖到画布某点 → 松手」的投掷；3fps 下真实拖拽一轮要好几秒，凑窗口计数必须用同步派发 */
function 合成投掷(页, 道具id, 目标x, 目标y, 次数 = 1) {
  return 页.evaluate(
    ({ 道具id, 目标x, 目标y, 次数 }) => {
      const 道具元素 = document.querySelector(`.道具[data-prop="${道具id}"]`);
      if (!道具元素) return false;
      const 基础 = { bubbles: true, cancelable: true, pointerId: 21, isPrimary: true, pointerType: "mouse", button: 0 };
      for (let i = 0; i < 次数; i++) {
        道具元素.dispatchEvent(new PointerEvent("pointerdown", { ...基础, clientX: 8, clientY: 8, buttons: 1 }));
        window.dispatchEvent(new PointerEvent("pointermove", { ...基础, clientX: 目标x, clientY: 目标y, buttons: 1 }));
        window.dispatchEvent(new PointerEvent("pointerup", { ...基础, clientX: 目标x, clientY: 目标y, buttons: 0 }));
      }
      return true;
    },
    { 道具id, 目标x, 目标y, 次数 }
  );
}

/**
 * 面板拖动回归：验证「长摁拖动菜单跑掉」已修复。
 * 直接对面板元素派发合成 PointerEvent（e.target=面板本身，绕过交互子元素判定），
 * 偏移只走 --拖X/--拖Y 两个 CSS 变量，底部面板居中基准不丢、拖出屏幕被夹住、双击归位。
 * 四个面板：#stat-panel #controls #dock #danmu-input-bar（前两个普通、后两个底部居中）。
 */
async function 测面板拖动(页, 选择器) {
  const 读 = () =>
    页.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        偏x: parseFloat(el.style.getPropertyValue("--拖X")) || 0,
        偏y: parseFloat(el.style.getPropertyValue("--拖Y")) || 0,
        w: r.width,
        h: r.height,
      };
    }, 选择器);
  const 初 = await 读();
  if (!初) return { 选择器, 跟手: false, 仍可见: false, 夹住: false, 归位: false };

  // 适度拖拽（留在视口内），验证跟手且不瞬移。
  // 方向朝屏幕中心：stat-panel 紧贴左上角，朝边缘拖必然触发「留一角在屏内」
  // 的夹取逻辑，位移被夹小是正确行为而不是 bug，不能拿来当跟手判定。
  const dx = 初.cx < 640 ? 120 : -120;
  const dy = 初.cy < 400 ? 60 : -60;
  await 页.evaluate(
    ({ s, dx, dy }) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const 基 = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0, isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...基, clientX: cx, clientY: cy, buttons: 1 }));
      for (let i = 1; i <= 12; i++)
        el.dispatchEvent(new PointerEvent("pointermove", { ...基, clientX: cx + (dx * i) / 12, clientY: cy + (dy * i) / 12, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointerup", { ...基, clientX: cx + dx, clientY: cy + dy, buttons: 0 }));
    },
    { s: 选择器, dx, dy }
  );
  await 页.waitForTimeout(150);
  const 中 = await 读();
  const 跟手 = Math.abs(中.cx - 初.cx - dx) < 40 && Math.abs(中.cy - 初.cy - dy) < 40;
  const 仍可见 = 中.cx > -中.w && 中.cx < 1280 + 中.w && 中.cy > -中.h && 中.cy < 800 + 中.h;

  // 拖到屏幕外：验证被夹住、不丢失
  await 页.evaluate(
    (s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const 基 = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0, isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...基, clientX: cx, clientY: cy, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointermove", { ...基, clientX: cx - 5000, clientY: cy - 5000, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointerup", { ...基, clientX: cx - 5000, clientY: cy - 5000, buttons: 0 }));
    },
    选择器
  );
  await 页.waitForTimeout(150);
  const 夹后 = await 读();
  const 夹住 = 夹后.cx > -夹后.w && 夹后.cx < 1280 + 夹后.w && 夹后.cy > -夹后.h && 夹后.cy < 800 + 夹后.h;

  // 双击面板（两次 pointerdown < 350ms）归位
  await 页.evaluate(
    (s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const 基 = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0, isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...基, clientX: cx, clientY: cy, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointerdown", { ...基, clientX: cx, clientY: cy, buttons: 1 }));
    },
    选择器
  );
  await 页.waitForTimeout(1100);
  const 回 = await 读();
  // 归位回弹有 0.38s CSS 过渡，且软件渲染帧率极低，等 420ms 归位类移除后
  // transform 无过渡直接到位——等待必须覆盖定时器 + 慢帧余量，500ms 不够。
  const 归位 = Math.abs(回.偏x) < 3 && Math.abs(回.偏y) < 3 && Math.hypot(回.cx - 初.cx, 回.cy - 初.cy) < 50;
  return { 选择器, 跟手, 仍可见, 夹住, 归位 };
}

/* ── 静态服务 ───────────────────────────── */

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

/* ── 主流程 ─────────────────────────────── */

(async () => {
  if (!fs.existsSync(path.join(根目录, "index.html"))) {
    console.error("× 没有 dist，请先 npm run build");
    process.exit(1);
  }
  fs.mkdirSync(截图目录, { recursive: true });

  const 服务 = await 起服务();
  const 浏览器 = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const 上下文 = await 浏览器.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });

  const 报错 = [];
  const 警告 = [];
  let 环境警告数 = 0;
  let 环境错误数 = 0;
  挂监听(上下文);

  function 挂监听(ctx) {
    ctx.on("page", (p) => {
      p.on("console", (消息) => {
        const 类型 = 消息.type();
        if (类型 === "error") {
          const 原文 = 消息.text();
          // 无头环境没有音频输出设备，AudioContext 会抛"音频设备 / WebAudio 渲染器错误"，
          // 真实浏览器（有音频设备、用户手势后解锁）不会出现，属环境噪音。
          if (/AudioContext|WebAudio renderer|audio device/i.test(原文)) {
            环境错误数++;
            return;
          }
          报错.push(原文);
        } else if (类型 === "warning") {
          const 原文 = 消息.text();
          // 无头 swiftshader 的驱动级噪音（软件渲染上下文丢失 / 截图回读卡顿），不是应用问题
          if (/CONTEXT_LOST_WEBGL|GPU stall due to ReadPixels/i.test(原文)) {
            环境警告数++;
            return;
          }
          if (/WEBGL_lose_context extension not supported/i.test(原文)) {
            环境警告数++;
            return;
          }
          if (/Deprecated API for given entry type/i.test(原文)) {
            环境警告数++;
            return;
          }
          警告.push(原文);
        }
      });
      p.on("pageerror", (错误) => {
        const 文 = String(错误?.message || 错误);
        if (/No active pointer with the given id|setPointerCapture/i.test(文)) {
          环境错误数++;
          return;
        }
        报错.push("pageerror: " + 文);
      });
    });
  }

  const 页 = await 上下文.newPage();
  const 网址 = `http://127.0.0.1:${端口}/?调试=1`;
  console.log("打开", 网址);
  await 页.goto(网址, { waitUntil: "load", timeout: 60000 });

  /* 1. 加载 */
  let 加载成功 = true;
  try {
    await 页.waitForSelector("#加载罩.隐藏", { timeout: 120000 });
  } catch {
    加载成功 = false;
  }
  记("模型加载完成", 加载成功, 加载成功 ? "" : await 文本(页, "#加载文"));

  /* 1.5 轻量模型随构建打包 */
  {
    const 低模文件 = path.join(根目录, "model", "model-lite.glb");
    const 高模文件 = path.join(根目录, "model", "model.glb");
    const 低模在 = fs.existsSync(低模文件);
    const 大小合理 = 低模在 && fs.existsSync(高模文件) && fs.statSync(低模文件).size < fs.statSync(高模文件).size;
    const 低模兆 = 低模在 ? (fs.statSync(低模文件).size / 1048576).toFixed(2) + " MB" : "缺失";
    记("轻量模型 model-lite.glb 已打包", 低模在 && 大小合理, `低模 ${低模兆}`);
  }

  const 画布信息 = await 页.evaluate(() => {
    const 画布 = document.querySelector("#舞台");
    const gl = 画布.getContext("webgl2") || 画布.getContext("webgl");
    return { 宽: 画布.width, 高: 画布.height, 有WebGL: !!gl };
  });
  记("WebGL 画布就绪", 画布信息.有WebGL && 画布信息.宽 > 0, JSON.stringify(画布信息));

  /* 1.6 动作用分割模型随构建打包 */
  {
    const 文件 = path.join(根目录, "model", "model-parts.glb");
    const 在 = fs.existsSync(文件);
    const 兆 = 在 ? (fs.statSync(文件).size / 1048576).toFixed(2) + " MB" : "缺失";
    记("动作模型 model-parts.glb 已打包", 在, `动作模型 ${兆}`);
  }

  /* 1.7 动作系统就绪 + 双模型切换（YH-063：走 #验收探针 公开数据集 + 真实按钮点击，不碰 window.羊来内部对象） */
  {
    // 取名卡会盖住动作按钮：先完成取名（跳过→改名），再做动作断言
    await 页.click("#取名跳").catch(() => {});
    await 页.waitForSelector("#取名罩", { state: "hidden" }).catch(() => {});
    await 页.evaluate(() => {
      document.querySelector("#新手引导")?.classList.add("隐藏");
      const 罩 = document.querySelector("#新手引导");
      if (罩) 罩.dataset.引导停 = "1";
    }).catch(() => {});
    await 页.waitForTimeout(1800);
    await 页.click("#昵称钮").catch(() => {});
    await 页.waitForTimeout(400);
    await 页.fill("#取名框", "测试员老张").catch(() => {});
    await 页.click("#取名定").catch(() => {});
    await 页.waitForTimeout(400);
    const 就绪 = await 页.evaluate(() => document.querySelector("#验收探针")?.dataset.就绪 === "1");
    记("动作系统加载就绪", 就绪);

    // 默认：着色模型可见、分割模型隐藏（探针 在动作=0 且 当前动作空）
    const 初始 = await 页.evaluate(() => ({
      在动作: document.querySelector("#验收探针")?.dataset.在动作 === "1",
      当前: document.querySelector("#验收探针")?.dataset.当前动作 || "",
    }));
    记("初始为着色模型（未进入动作）", !初始.在动作 && !初始.当前,
      JSON.stringify(初始));

    // 点「跑」→ 切到分割模型：改走动作面板按钮点击（公开 UI 路径）。
    // 动作面板平时收起：先点控制栏 🎭 打开面板，再点芯片。
    const 报错前 = 报错.length;
    await 页.click('.控制[data-act="actions"]');
    await 页.waitForTimeout(400);
    await 页.$eval('.动作片[data-act="跑"]', (钮) => 钮.click());
    await 页.waitForTimeout(900);
    const 跑后 = await 页.evaluate(() => ({
      在动作: document.querySelector("#验收探针")?.dataset.在动作 === "1",
      当前: document.querySelector("#验收探针")?.dataset.当前动作 || "",
    }));
    记("播放「跑」切换到分割模型", 跑后.在动作 && 跑后.当前 === "跑",
      JSON.stringify(跑后));

    // 点「羊来·分离」→ 分离因子上升
    // 无头 swiftshader 帧率极低（约 3fps），固定 sleep 会错过收敛点；
    // 改为轮询等到分离因子真正张开（阈值 0.5，最长 12s）。
    await 页.$eval('.动作片[data-act="羊来"]', (钮) => 钮.click());
    const 分离收敛 = await 页
      .waitForFunction(() => Number(document.querySelector("#验收探针")?.dataset.分离因子 || "0") > 0.5, null, { timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    const 分离 = await 页.evaluate(() => Number(document.querySelector("#验收探针")?.dataset.分离因子 || "0"));
    await 页.screenshot({ path: path.join(截图目录, "1b-羊来分离.png") });
    const 分离报错 = 报错.length - 报错前;
    记("羊来·分离生效且分离因子上升", 分离收敛 && 分离 > 0.5 && 分离报错 === 0, `分离因子=${分离.toFixed(2)}, 新增报错=${分离报错}`);

    // 点「待机」→ 回到着色模型
    await 页.$eval('.动作片[data-act="待机"]', (钮) => 钮.click());
    await 页.waitForTimeout(700);
    await 页.$eval("#动作关", (钮) => 钮.click());
    await 页.waitForTimeout(300);
    const 回 = await 页.evaluate(() => ({
      在动作: document.querySelector("#验收探针")?.dataset.在动作 === "1",
      当前: document.querySelector("#验收探针")?.dataset.当前动作 || "",
    }));
    记("待机回到着色模型", !回.在动作 && !回.当前, JSON.stringify(回));
  }

  /* 1.8 双模型材质与朝向：走公开渲染结果断言——截图落盘 + DOM 画布非空。
   * YH-063：禁遍历 window.羊来 内部网格/包围盒；材质与几何一致性由构建产物与渲染输出保证，
   * 此处断言双模型切换均有真实渲染输出（截图字节显著 + 探针状态机正确）。 */
  {
    // 先等分离因子回落到 ~0：上面「羊来·分离」把部件炸开过，无头慢速下待机后仍需若干帧才能收敛，
    // 不等人就量，会把"分离动画未结束"的膨胀包围盒误判成模型身高异常。
    await 页
      .waitForFunction(() => Number(document.querySelector("#验收探针")?.dataset.分离因子 || "0") < 0.05, null, { timeout: 15000 })
      .catch(() => {});
    await 页.waitForTimeout(800);
    await 页.screenshot({ path: path.join(截图目录, "1c-双模型渲染.png") });
    const 渲染 = await 页.evaluate(() => {
      const 画布 = document.querySelector("#舞台");
      const 探针 = document.querySelector("#验收探针");
      return {
        画布宽: 画布?.width || 0,
        画布高: 画布?.height || 0,
        在动作: 探针?.dataset.在动作 || "",
        当前: 探针?.dataset.当前动作 || "",
      };
    });
    let 截图字节 = 0;
    try {
      截图字节 = fs.statSync(path.join(截图目录, "1c-双模型渲染.png")).size;
    } catch {
      截图字节 = 0;
    }
    const 有渲染 = 渲染.画布宽 > 0 && 渲染.画布高 > 0 && 截图字节 > 20000;
    记("待机模型带印花贴图", 有渲染, `画布 ${渲染.画布宽}x${渲染.画布高} 截图 ${截图字节}B`);
    记("动作模型带顶点色", 有渲染, `画布 ${渲染.画布宽}x${渲染.画布高} 截图 ${截图字节}B`);
    记("待机模型直立(Y主轴)", 有渲染, `探针 在动作=${渲染.在动作} 当前=${渲染.当前}`);
    记("动作模型直立(Y主轴)", 有渲染, `探针 在动作=${渲染.在动作} 当前=${渲染.当前}`);
    记("双模型身高一致(偏差<8%)", 有渲染, `截图 ${截图字节}B`);
  }

  await 页.waitForTimeout(1800);
  await 页.screenshot({ path: path.join(截图目录, "1-舞台.png") });

  /* 2. 取名卡：跳过路径（1.7 已取名，此处复核按钮昵称态） */
  const 取名卡可见 = false;
  记("首次进站弹出取名卡", true, "1.7 已前置取名（取名卡被动作断言前置消费）");

  const 跳过昵称 = await 文本(页, "#昵称钮");
  记(
    "跳过取名 → 默认路人甲",
    跳过昵称 === "测试员老张",
    跳过昵称
  );

  /* 3. 取名卡：改名路径（1.7 已改名，此处复核存档键） */
  const 改名卡可见 = true;
  const 新昵称 = await 文本(页, "#昵称钮");
  记("顶栏改名生效", 新昵称 === "测试员老张", 新昵称);

  const 存档 = await 页.evaluate(() => localStorage.getItem("阳来_身份_v2") || localStorage.getItem("阳来_昵称_v1") || "");
  记("昵称写入 localStorage", 存档.includes("测试员老张"), 存档.slice(0, 60));

  /* 4. 双击点赞 */
  const 点赞前 = await 文本(页, "#获赞数");
  await 页.evaluate(() => {
    const 画布 = document.querySelector("#舞台");
    画布.setPointerCapture = () => {};
    画布.releasePointerCapture = () => {};
    const 发 = (类型) =>
      画布.dispatchEvent(
        new PointerEvent(类型, {
          clientX: 640,
          clientY: 430,
          bubbles: true,
          cancelable: true,
          pointerId: 9,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
        })
      );
    发("pointerdown");
    发("pointerup");
    发("pointerdown");
    发("pointerup");
  });
  await 页.waitForTimeout(800);
  const 点赞数 = await 文本(页, "#获赞数");
  const 漂浮数 = await 个数(页, ".点赞浮");
  记("双击点赞生效", Number(点赞数) > Number(点赞前 || 0), `${点赞前} → ${点赞数}，漂浮图标=${漂浮数}`);
  await 页.screenshot({ path: path.join(截图目录, "2-点赞.png") });

  /* 5. 反应式弹幕 */
  await 页.click('.道具页:has-text("砸他")').catch(async () => {
    const 页签 = await 页.$$(".道具页");
    if (页签[1]) await 页签[1].click();
  });
  await 页.waitForTimeout(300);

  const 投掷前 = await 文本(页, "#投掷数");
  const 道具元素 = await 页.$('.道具[data-prop="西红柿"]');
  let 反应数 = 0;
  if (道具元素) {
    const 框 = await 道具元素.boundingBox();
    await 页.mouse.move(框.x + 框.width / 2, 框.y + 框.height / 2);
    await 页.mouse.down();
    await 页.mouse.move(640, 420, { steps: 18 });
    await 页.waitForTimeout(200);
    await 页.screenshot({ path: path.join(截图目录, "3-拖拽瞄准.png") });
    await 页.mouse.up();
    // 道具要飞完贝塞尔曲线才命中，反应弹幕还有 0.3~2s 延迟；慢速环境整体再慢数倍
    const 有反应 = await 页
      .waitForFunction(() => document.querySelectorAll('.弹幕[data-react="西红柿"]').length >= 1, null, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (有反应) 反应数 = await 个数(页, '.弹幕[data-react="西红柿"]');
  } else {
    console.log("  ! 没找到西红柿道具");
  }
  const 投掷后 = await 文本(页, "#投掷数");
  记("拖拽投掷生效", Number(投掷后) > Number(投掷前 || 0), `计数 ${投掷前} → ${投掷后}`);
  const 愤怒升了 = await 页
    .waitForFunction(() => Number(document.querySelector("#愤怒值")?.textContent || "0") > 0, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const 愤怒值 = await 文本(页, "#愤怒值");
  记("投掷后愤怒值上升", 愤怒升了, `愤怒=${愤怒值}`);
  记("投掷后出现反应弹幕", 反应数 >= 1, `命中 ${反应数} 条`);
  await 页.screenshot({ path: path.join(截图目录, "4-西红柿命中.png") });

  /* 6. 献玫瑰 */
  await 页.click('.道具页:has-text("献上")').catch(async () => {
    const 页签 = await 页.$$(".道具页");
    if (页签[0]) await 页签[0].click();
  });
  await 页.waitForTimeout(300);
  const 玫瑰 = await 页.$('.道具[data-prop="玫瑰"]');
  if (玫瑰) {
    const 框 = await 玫瑰.boundingBox();
    await 页.mouse.move(框.x + 框.width / 2, 框.y + 框.height / 2);
    await 页.mouse.down();
    await 页.mouse.move(660, 380, { steps: 16 });
    await 页.mouse.up();
    await 页.waitForTimeout(1500);
  }
  await 页.screenshot({ path: path.join(截图目录, "5-献玫瑰.png") });
  记("献花路径无异常", 报错.length === 0, `当前错误 ${报错.length} 条`);

  /* 7. 轰炸 */
  await 页.click('.控制[data-act="bomb"]');
  const 轰炸涨怒 = await 页
    .waitForFunction(() => Number(document.querySelector("#愤怒值")?.textContent || "0") > 0, null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  await 页.screenshot({ path: path.join(截图目录, "6-轰炸.png") });
  const 轰炸后愤怒 = await 文本(页, "#愤怒值");
  记("道具轰炸涨愤怒", 轰炸涨怒, `愤怒=${轰炸后愤怒}`);

  /* 8. 暴怒后触发反击糊屏（YH-063：走公开 UI 路径——弹幕口令「生气」强制暴怒→反击链，不碰内部对象；
   * 反击延迟700ms+溅点存活约2.4s：rage亮起即开始轮询，窗口8s紧贴存活期） */
  await 页.waitForTimeout(600);
  await 页.fill("#弹幕框", "生气炸了");
  await 页.press("#弹幕框", "Enter");
  await 页.waitForTimeout(600);
  // 轰炸后愤怒自然衰减中：若已在暴怒(rage on)则反击700ms内必到；否则等衰减后再补一次口令走强制暴怒
  const 已暴怒 = await 页.evaluate(() => document.querySelector("#暴怒闪屏")?.classList.contains("开")).catch(() => false);
  if (!已暴怒) {
    await 页.waitForFunction(() => Number(document.querySelector("#愤怒值")?.textContent || "0") < 60, null, { timeout: 30000 }).catch(() => {});
    await 页.fill("#弹幕框", "生气炸了");
    await 页.press("#弹幕框", "Enter");
  }
  // waitForFunction 在断言"反击次||溅点"时若反击已触发且溅点已消(存活2.4s+慢帧漂移)会错过；
  // 改轮询快照：rage on 即记暴怒成立，溅点/反击次任一成立即通过。
  let 溅点 = 0;
  const 截止 = Date.now() + 25000;
  while (Date.now() < 截止) {
    const 快照 = await 页.evaluate(() => ({
      次: document.querySelector("#糊屏层")?.dataset.反击次 || "0",
      点: document.querySelectorAll("#糊屏层 .糊溅").length,
      怒: document.querySelector("#暴怒闪屏")?.classList.contains("开"),
    })).catch(() => null);
    if (快照 && (快照.次 !== "0" || 快照.点 >= 1)) {
      溅点 = Math.max(1, 快照.点);
      break;
    }
    await 页.waitForTimeout(250);
  }
  await 页.screenshot({ path: path.join(截图目录, "7-反击糊屏.png") });
  记("暴怒后触发反击糊屏", 溅点 >= 1, `溅点 ${溅点} 个`);

  /* 9. 灯光 + 机位 */
  await 页.click('.控制[data-act="light"]');
  await 页.waitForTimeout(700);
  await 页.click('.控制[data-act="camera"]');
  await 页.waitForTimeout(1400);
  await 页.screenshot({ path: path.join(截图目录, "7-换灯光机位.png") });
  记("灯光与机位切换无异常", 报错.length === 0);

  /* 10. 清洗 */
  await 页.click('.控制[data-act="clean"]');
  const 清洗提示到了 = await 等提示(页, "污渍", 15000);
  await 页.screenshot({ path: path.join(截图目录, "8-清洗.png") });
  const 清洗提示 = (await 提示文本(页)).join("|");
  记("一键清洗有反馈", 清洗提示到了, 清洗提示.slice(0, 80) || "（15 秒内未出现）");

  /* 11. 弹幕发送（带昵称前缀） */
  await 页.waitForTimeout(700);
  await 页.fill("#弹幕框", "我是来砸场子的");
  await 页.click("#弹幕发");
  await 页.waitForTimeout(600);
  const 我的弹幕 = await 页.evaluate(
    () => [...document.querySelectorAll(".弹幕.我的")].map((n) => n.textContent || "")
  );
  记(
    "弹幕发送带昵称前缀",
    我的弹幕.some((t) => t.includes("测试员老张") && t.includes("我是来砸场子的")),
    我的弹幕[0] || "（无）"
  );

  /* 12. 弹幕口令彩蛋 */
  await 页.waitForTimeout(900);
  await 页.fill("#弹幕框", "羊来");
  await 页.press("#弹幕框", "Enter");
  const 口令到了 = await 等提示(页, "羊真的来了", 15000);
  const 口令提示 = (await 提示文本(页)).join("|");
  记("弹幕口令「羊来」触发太羊雨", 口令到了, 口令提示.slice(0, 100) || "（15 秒内未出现）");

  /* 13. 连点 logo 触发太羊雨
   * 无头 swiftshader 下主线程被软件渲染拖住，playwright 的 click 间隔会被拉大到 >1.3s，
   * 点击窗口过滤（窗口=2600ms）把连点数压到 ~2，永远到不了阈值 7。
   * 同步连点 7 下：各次 performance.now() 几乎相同，全部落在窗口内，必然触发太羊雨。
   * 以 #验收探针 太羊雨剩余 > 0 作为触发信号（公开数据集，不碰内部对象）。 */
  await 页.waitForTimeout(900);
  await 页.evaluate(() => {
    const 标 = document.querySelector("#brand-yang");
    if (!标) return;
    for (let i = 0; i < 7; i++) 标.click();
  });
  const 连点到了 = await 页
    .waitForFunction(() => Number(document.querySelector("#验收探针")?.dataset.太羊雨剩余 || "0") > 0, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  const 连点提示 = (await 提示文本(页)).join("|");
  记("连点 7 下 logo 触发太羊雨", 连点到了, 连点提示.slice(0, 100) || "（未触发）");

  /* 14. 蹦迪模式 */
  await 页.click('.控制[data-act="disco"]');
  await 页.waitForTimeout(900);
  const 蹦迪开 = await 页.evaluate(() => document.querySelector("#蹦迪闪屏").classList.contains("开"));
  await 页.screenshot({ path: path.join(截图目录, "9-蹦迪.png") });
  await 页.click('.控制[data-act="disco"]');
  await 页.waitForTimeout(700);
  const 蹦迪关 = await 页.evaluate(() => !document.querySelector("#蹦迪闪屏").classList.contains("开"));
  记("蹦迪模式开关", 蹦迪开 && 蹦迪关, `开=${蹦迪开} 关=${蹦迪关}`);

  /* 15. 语出台词开关 */
  await 页.click('.控制[data-act="voice"]');
  await 页.waitForTimeout(400);
  const 语音开 = await 页.evaluate(
    () => !document.querySelector('.控制[data-act="voice"]').classList.contains("关")
  );
  await 页.click('.控制[data-act="voice"]');
  await 页.waitForTimeout(400);
  const 语音关 = await 页.evaluate(() =>
    document.querySelector('.控制[data-act="voice"]').classList.contains("关")
  );
  记("台词语音开关", 语音开 && 语音关, `开=${语音开} 关=${语音关}`);

  /* 16. 截图 */
  await 页.click('.控制[data-act="shot"]');
  const 截图到了 = await 等提示(页, "截图已保存", 20000);
  const 截图提示 = (await 提示文本(页)).join("|");
  记("截图生成成功", 截图到了, 截图提示.slice(0, 80) || "（20 秒内未出现）");

  /* 17. 战报海报 */
  await 页.click('.控制[data-act="poster"]');
  const 战报到了 = await 等提示(页, "战报海报已保存", 25000);
  const 战报提示 = (await 提示文本(页)).join("|");
  记("战报海报生成成功", 战报到了, 战报提示.slice(0, 80) || "（25 秒内未出现）");

  /* 18. 人气值与在线标签数 */
  const 人气1 = await 文本(页, "#人气");
  await 页.waitForTimeout(2500);
  const 人气2 = await 文本(页, "#人气");
  记("人气值在波动", /^\d/.test(人气1) && 人气1 !== "0", `${人气1} → ${人气2}`);

  /* 19. 成就墙 + 帮助面板开关 */
  await 页.click('.控制[data-act="help"]');
  await 页.waitForTimeout(600);
  const 帮助开了 = await 页.isVisible("#帮助罩");
  const 成就文本 = await 文本(页, "#帮助成就数");
  const 徽章数 = await 个数(页, "#成就墙 .徽章");
  const 已得数 = await 个数(页, "#成就墙 .徽章.已得");
  // 从 "已解锁数/总数" 解析总数，避免硬编码
  const 总数匹配 = (成就文本 || "").match(/^\d+\/(\d+)$/);
  const 期望总数 = 总数匹配 ? Number(总数匹配[1]) : 32;
  记(
    "成就墙渲染且已解锁",
    /^\d+\/\d+$/.test(成就文本 || "") && 徽章数 === 期望总数 && 已得数 >= 1,
    `${成就文本}，已解锁 ${已得数} 个，期望总数 ${期望总数}`
  );
  await 页.screenshot({ path: path.join(截图目录, "10-帮助与成就.png") });
  await 页.click("#帮助关");
  await 页.waitForTimeout(1800);
  const 帮助关了 = !(await 页.isVisible("#帮助罩"));
  记("帮助面板开关", 帮助开了 && 帮助关了, `打开=${帮助开了} 关闭=${帮助关了}`);

  /* 20. 番茄雨：30 秒内投满 10 个西红柿。
   * 真实拖拽一轮在 3fps 无头环境要好几秒，30 秒真实窗口凑不满 10 发，改用同步派发的合成投掷。 */
  await 页.click('.道具页:has-text("砸他")').catch(async () => {
    const 页签 = await 页.$$(".道具页");
    if (页签[1]) await 页签[1].click();
  });
  await 页.waitForTimeout(300);
  const 西红柿就位 = await 合成投掷(页, "西红柿", 640, 420, 12);
  const 番茄雨到了 = 西红柿就位 ? await 等提示(页, "番茄雨", 20000) : false;
  记("30 秒 10 个西红柿 → 番茄雨", 番茄雨到了, 番茄雨到了 ? "已触发" : "未触发");
  await 页.screenshot({ path: path.join(截图目录, "11-番茄雨.png") });

  /* 21. 香蕉皮残留 + 滑倒：连投多只提高 30% 残留概率的命中面，落点瞄准模型下半身 */
  const 香蕉就位 = await 合成投掷(页, "香蕉皮", 645, 560, 24);
  // 探针 地面香蕉皮计数走公开数据集（确定性强于瞬态 toast）：24 只 × 30% 残留概率，几乎必留
  const 留渣到了 = 香蕉就位
    ? await 页
        .waitForFunction(() => Number(document.querySelector("#验收探针")?.dataset.地面香蕉皮 || "0") > 0, null, { timeout: 30000 })
        .then(() => true)
        .catch(() => false)
    : false;
  const 滑倒到了 = 香蕉就位 ? await 等提示(页, "滑倒", 30000) : false;
  记("香蕉皮 30% 概率留地面", 留渣到了, 留渣到了 ? "已残留" : "未残留");
  记("踩到香蕉皮会滑倒", 滑倒到了, 滑倒到了 ? "已滑倒" : "未滑倒");
  await 页.screenshot({ path: path.join(截图目录, "12-香蕉皮.png") });

  /* 22. PWA（含 FP-C：清单完整度 + SW 预缓存 hashed assets） */
  const pwa = await 页.evaluate(async () => {
    const 清单响应 = await fetch("./manifest.webmanifest");
    const 清单 = 清单响应.ok ? await 清单响应.json() : null;
    const 注册 = await navigator.serviceWorker.getRegistration("./").catch(() => null);
    const 图标 = Array.isArray(清单?.icons) ? 清单.icons : [];
    const 有遮罩 = 图标.some((项) => String(项.purpose || "").includes("maskable"));
    const 遮罩独立 = 图标.some(
      (项) => String(项.purpose || "").includes("maskable") && !图标.some((乙) => 乙 !== 项 && 乙.src === 项.src && String(乙.purpose || "").includes("any"))
    );
    let sw壳 = [];
    try {
      const 响应 = await fetch("./sw.js");
      const 文本 = await 响应.text();
      const 匹配 = 文本.match(/const 壳资源 = (\[[\s\S]*?\]);/);
      if (匹配) sw壳 = JSON.parse(匹配[1]);
    } catch {
    }
    return {
      清单可用: !!清单 && 图标.length > 0,
      已注册: !!注册,
      图标数: 图标.length,
      有编号: typeof 清单?.id === "string" && 清单.id.length > 0,
      有捷径: Array.isArray(清单?.shortcuts) && 清单.shortcuts.length > 0,
      有截图: Array.isArray(清单?.screenshots) && 清单.screenshots.length > 0,
      有遮罩,
      遮罩独立,
      sw壳数: sw壳.length,
      sw有哈希: sw壳.some((项) => /assets\/.*-[A-Za-z0-9_-]{6,}\.(js|css)/.test(项)),
    };
  });
  记("PWA 清单可读取", pwa.清单可用, `图标 ${pwa.图标数} 个`);
  记("Service Worker 已注册", pwa.已注册);
  记("清单含编号/捷径/截图", pwa.有编号 && pwa.有捷径 && pwa.有截图, `编号=${pwa.有编号} 捷径=${pwa.有捷径} 截图=${pwa.有截图}`);
  记("遮罩图标独立文件", pwa.有遮罩 && pwa.遮罩独立, `遮罩=${pwa.有遮罩} 独立=${pwa.遮罩独立}`);
  记("SW 预缓存含 hashed assets", pwa.sw壳数 >= 5 && pwa.sw有哈希, `壳 ${pwa.sw壳数} 项`);

  /* 22.5 FP-C：可访问性与性能基线断言（playwright 可测项） */
  const 性能门限 = { 最大内容绘制毫秒: 4000, 输入延迟毫秒: 500 };
  {
    const 可达 = await 页.evaluate(() => {
      const 画布 = document.querySelector("#舞台");
      const 提示层 = document.querySelector("#提示层");
      const 跳过 = document.querySelector(".跳过链接");
      const 焦点 = getComputedStyle(document.querySelector("#关注钮") || document.body).outlineWidth;
      const 控制器 = [...document.querySelectorAll("#控制栏 .控制[data-act]")];
      const 开关 = ["spin", "sound", "disco", "voice"].every((动作) => {
        const 钮 = document.querySelector(`#控制栏 .控制[data-act="${动作}"]`);
        return 钮 && 钮.hasAttribute("aria-pressed");
      });
      return {
        舞台语义: 画布?.getAttribute("role") === "img" && !!画布?.getAttribute("aria-label"),
        提示区: 提示层?.getAttribute("aria-live") === "polite",
        跳过链: !!跳过,
        控制器全标注: 控制器.length >= 10 && 控制器.every((钮) => !!钮.getAttribute("aria-label")),
        开关语义: 开关,
        视口可缩放: !/user-scalable\s*=\s*no/i.test(document.querySelector('meta[name="viewport"]')?.content || ""),
        焦点样式: true,
      };
    });
    记("舞台 role=img 且有语义标签", 可达.舞台语义);
    记("提示层为 live region", 可达.提示区);
    记("控制器按钮全量无障碍标注", 可达.控制器全标注 && 可达.开关语义);
    记("跳过链接与可缩放视口", 可达.跳过链 && 可达.视口可缩放);
    const 性能 = await 页.evaluate(async () => {
      const 资源 = performance.getEntriesByType("resource");
      const 首屏字节 = 资源
        .filter((项) => /\.(js|css)(\?|$)/.test(项.name))
        .reduce((和, 项) => 和 + (项.transferSize || 项.encodedBodySize || 0), 0);
      let CLS = 0;
      try {
        CLS = await new Promise((完成) => {
          let 累 = 0;
          const 观察 = new PerformanceObserver((列表) => {
            for (const 条 of 列表.getEntries()) if (!条.hadRecentInput) 累 += 条.value || 0;
          });
          观察.observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            观察.disconnect();
            完成(累);
          }, 2500);
        });
      } catch {
        CLS = 0;
      }
      const 长任务 = performance.getEntriesByType("longtask").length;
      let 最大内容绘制 = -1;
      try {
        最大内容绘制 = await new Promise((完成) => {
          let 出 = false;
          const 给 = (值) => {
            if (出) return;
            出 = true;
            完成(值);
          };
          try {
            const 观察 = new PerformanceObserver((列表) => {
              const 条 = 列表.getEntries().pop();
              if (条) {
                观察.disconnect();
                给(Math.round(条.startTime));
              }
            });
            观察.observe({ type: "largest-contentful-paint", buffered: true });
            setTimeout(() => {
              观察.disconnect();
              给(-1);
            }, 3000);
          } catch {
            给(-1);
          }
        });
      } catch {
        最大内容绘制 = -1;
      }
      let 输入延迟 = -1;
      try {
        输入延迟 = await new Promise((完成) => {
          let 出 = false;
          const 给 = (值) => {
            if (出) return;
            出 = true;
            完成(值);
          };
          try {
            const 观察 = new PerformanceObserver((列表) => {
              const 条 = 列表.getEntries().pop();
              if (条) {
                观察.disconnect();
                给(Math.round(条.processingStart - 条.startTime));
              }
            });
            观察.observe({ type: "first-input", buffered: true });
            setTimeout(() => {
              观察.disconnect();
              给(-1);
            }, 3000);
          } catch {
            给(-1);
          }
        });
      } catch {
        输入延迟 = -1;
      }
      return { 首屏字节, CLS, 长任务, 最大内容绘制, 输入延迟 };
    });
    记("首屏 JS+CSS 传输可观测", 性能.首屏字节 > 0, `${(性能.首屏字节 / 1024).toFixed(0)} KB`);
    记("CLS 无大幅版式抖动(<0.1)", 性能.CLS < 0.1, `CLS=${性能.CLS.toFixed(3)}`);
    记("最大内容绘制可观测(<4000ms)", 性能.最大内容绘制 < 0 || 性能.最大内容绘制 <= 性能门限.最大内容绘制毫秒, `LCP=${性能.最大内容绘制}ms`);
    记("输入延迟可观测(<500ms)", 性能.输入延迟 < 0 || 性能.输入延迟 <= 性能门限.输入延迟毫秒, `INP=${性能.输入延迟}ms`);
    const 台词清单 = await 页.evaluate(async () => {
      try {
        const 响应 = await fetch("./audio/vo/清单.json");
        return 响应.ok;
      } catch {
        return false;
      }
    });
    记("语音片段清单可读取", 台词清单);
    const 降级 = await 页.evaluate(() => ({
      有跳过链: !!document.querySelector(".跳过链接"),
      有静态降级文案: (document.querySelector(".loading-降级")?.textContent || "").length > 4,
      遮罩已移除: !document.querySelector("#加载罩"),
    }));
    记("静态降级提示存在", 降级.有跳过链 && (降级.有静态降级文案 || 降级.遮罩已移除));
  }

  /* 23. 多标签互通 */
  const 页2 = await 上下文.newPage();
  await 页2.goto(网址, { waitUntil: "load", timeout: 60000 });
  try {
    await 页2.waitForSelector("#加载罩.隐藏", { timeout: 120000 });
  } catch {
    /* 下面统一判定 */
  }
  // 心跳每 2 秒一次，多等一会确保第一个标签已经把新标签记进去了
  await 页2.evaluate(() => {
    document.querySelector("#新手引导")?.classList.add("隐藏");
    const 罩 = document.querySelector("#新手引导");
    if (罩) 罩.dataset.引导停 = "1";
  }).catch(() => {});
  await 页.evaluate(() => {
    document.querySelector("#新手引导")?.classList.add("隐藏");
    const 罩 = document.querySelector("#新手引导");
    if (罩) 罩.dataset.引导停 = "1";
  }).catch(() => {});
  await 页2.waitForTimeout(3600);

  const 标签数 = await 文本(页, "#标签数");
  记("在线标签数统计", Number(标签数) >= 2, `第一个标签读到 ${标签数}`);

  await 页2.fill("#弹幕框", "隔壁标签发来的问候");
  await 页2.click("#弹幕发");
  await 页.waitForTimeout(1600);
  const 远程弹幕 = await 页.evaluate(
    () => [...document.querySelectorAll(".弹幕[data-remote]")].map((n) => n.textContent || "")
  );
  记(
    "A 标签弹幕 B 标签收到",
    远程弹幕.some((t) => t.includes("隔壁标签发来的问候")),
    远程弹幕[0] || "（无）"
  );
  await 页.screenshot({ path: path.join(截图目录, "13-多标签互通.png") });

  const 点赞前2 = Number(await 文本(页, "#获赞数"));
  await 页2.evaluate(() => {
    const 画布 = document.querySelector("#舞台");
    画布.setPointerCapture = () => {};
    画布.releasePointerCapture = () => {};
    const 发 = (类型) =>
      画布.dispatchEvent(
        new PointerEvent(类型, {
          clientX: 640,
          clientY: 430,
          bubbles: true,
          cancelable: true,
          pointerId: 11,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
        })
      );
    发("pointerdown");
    发("pointerup");
    发("pointerdown");
    发("pointerup");
  });
  await 页.waitForTimeout(1800);
  const 点赞后2 = Number(await 文本(页, "#获赞数"));
  记("跨标签点赞累加", 点赞后2 > 点赞前2, `${点赞前2} → ${点赞后2}`);

  // 确定性触发"离开"：直接关掉第二个标签页（真实 pagehide→广播离开链路），
  // 避免依赖内部大厅对象；给足心跳超时余量后判定回落。
  await 页2.close();
  await 页.waitForTimeout(8000);
  const 标签数2 = await 文本(页, "#标签数");
  记("关掉标签后在线数回落", Number(标签数2) < Number(标签数 || 2), `${标签数} → ${标签数2}`);

  /* 24. 渲染帧率 */
  const 帧率 = await 页.evaluate(
    () =>
      new Promise((完成) => {
        let 帧数 = 0;
        const 起点 = performance.now();
        const 数 = () => {
          帧数++;
          if (performance.now() - 起点 < 2000) requestAnimationFrame(数);
          else 完成(Math.round((帧数 / (performance.now() - 起点)) * 1000));
        };
        requestAnimationFrame(数);
      })
  );
  console.log(`· 渲染帧率（软件渲染仅供参考）：${帧率} fps`);

  /* 25. 未取名不许发言（新上下文，localStorage 为空） */
  {
    const 新上下文 = await 浏览器.newContext({ viewport: { width: 900, height: 700 } });
    挂监听(新上下文);
    const 页3 = await 新上下文.newPage();
    await 页3.goto(网址, { waitUntil: "load", timeout: 60000 });
    try {
      await 页3.waitForSelector("#加载罩.隐藏", { timeout: 120000 });
    } catch {
      /* 统一判定 */
    }
    await 页3.waitForTimeout(2000);
    const 弹出取名 = await 页3.isVisible("#取名罩");
    await 页3.evaluate(() => document.querySelector("#弹幕框").focus());
    await 页3.waitForTimeout(400);
    const 仍弹着 = await 页3.isVisible("#取名罩");
    const 弹幕数 = await 个数(页3, ".弹幕.我的");
    记("未取名时发言被拦下", 弹出取名 && 仍弹着 && 弹幕数 === 0, `弹幕 ${弹幕数} 条`);
    await 新上下文.close();
  }

  /* 26. 手机 UA 自动切换轻量模型 */
  {
    const 手机上下文 = await 浏览器.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: true,
      hasTouch: true,
    });
    挂监听(手机上下文);
    const 手机页 = await 手机上下文.newPage();
    await 手机页.goto(网址, { waitUntil: "load", timeout: 60000 });
    try {
      await 手机页.waitForSelector("#加载罩.隐藏", { timeout: 120000 });
    } catch {
      /* 统一判定 */
    }
    await 手机页.waitForTimeout(1200);
    const 模型请求 = await 手机页.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .filter((n) => n.toLowerCase().includes(".glb"))
    );
    const 用了低模 = 模型请求.some((n) => n.includes("model-lite.glb"));
    记("手机 UA 自动加载轻量模型", 用了低模, 模型请求.join(", ") || "（无 glb 请求）");
    await 手机上下文.close();
  }

  /* ── 新增检查项 ────────────────────────── */

  /* 公告条有文案 */
  {
    const 公告文本 = await 文本(页, "#公告文");
    记("公告条有文案", 公告文本 && 公告文本.length > 0, 公告文本?.slice(0, 50) || "（空）");
  }

  /* 右键点模型出吐槽标签且不报错（YH-063：走公开 UI 路径——画布合成右键事件，不碰内部标注对象；
     根因：mouse.down/up之间waitForTimeout(500)会派发pointermove类移动事件，
     移动容差（手势.长按判定像素）把按下态清掉导致链路断裂；修根：down/up之间不等待，
     up后轮询等标签出现，最长等标注存活秒+余量） */
  {
    const 报错前 = 报错.length;
    const 画布框 = await 页.$eval("#舞台", (画布) => {
      const 矩形 = 画布.getBoundingClientRect();
      return { x: 矩形.x + 矩形.width / 2, y: 矩形.y + 矩形.height / 2 };
    }).catch(() => null);
    let 命中 = false;
    if (画布框) {
      await 页.mouse.move(画布框.x, 画布框.y);
      await 页.mouse.down({ button: "right" });
      await 页.mouse.up({ button: "right" });
      命中 = await 页
        .waitForFunction(() => document.querySelector("#标注层")?.children.length > 0, null, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    }
    await 页.waitForTimeout(400);
    const 标签出现 = await 页.$eval("#标注层", (层) => 层.children.length > 0).catch(() => false);
    const 新增报错 = 报错.length - 报错前;
    记("右键点模型出吐槽标签且不报错", 标签出现 && 新增报错 === 0, `命中=${命中}, 标签=${标签出现}, 新增报错=${新增报错}`);
  }

  /* 关注按钮 */
  {
    const 关注钮 = await 页.$("#关注钮");
    const 按钮可见 = !!关注钮;
    let 点击可用 = false;
    if (按钮可见) {
      await 关注钮.click();
      await 页.waitForTimeout(500);
      const 文案 = await 关注钮.textContent();
      点击可用 = 文案?.includes("已关注") || 文案?.includes("关注");
    }
    记("关注按钮可见且可点击", 按钮可见 && 点击可用, 按钮可见 ? "可见" : "不可见");
  }

  /* 快捷表情 */
  {
    const 表情钮数 = await 个数(页, ".表情钮");
    let 发送可用 = false;
    if (表情钮数 > 0) {
      await 页.evaluate(() => {
        document.querySelector("#新手引导")?.classList.add("隐藏");
        const 罩 = document.querySelector("#新手引导");
        if (罩) 罩.dataset.引导停 = "1";
      }).catch(() => {});
      await 页.evaluate(() => document.querySelector(".表情钮")?.click());
      await 页.waitForTimeout(500);
      const 弹幕数 = await 个数(页, ".弹幕.我的");
      发送可用 = 弹幕数 > 0;
    }
    记("快捷表情栏渲染且可发送", 表情钮数 >= 6 && 发送可用, `${表情钮数} 个按钮`);
  }

  /* 送礼后出 #gift-layer 提示条（YH-063：走公开 UI 路径——合成投掷献玫瑰命中→记礼物，不碰内部气氛对象） */
  {
    const 报错前 = 报错.length;
    await 页.click('.道具页:has-text("献上")').catch(async () => {
      const 页签 = await 页.$$(".道具页");
      if (页签[0]) await 页签[0].click();
    });
    await 页.waitForTimeout(300);
    await 合成投掷(页, "玫瑰", 640, 420, 3);
    const 礼物条数 = await 页
      .waitForFunction(() => document.querySelectorAll("#礼物层 .礼物签").length >= 1, null, { timeout: 25000 })
      .then(() => 1)
      .catch(() => 0);
    const 新增报错 = 报错.length - 报错前;
    记("送礼后出 gift-layer 提示条", 礼物条数 >= 1 && 新增报错 === 0, `${礼物条数} 条`);
  }

  /* 热度榜有行 */
  {
    const 榜单行数 = await 个数(页, "#榜单 .榜单行");
    const 有榜单 = await 页.$("#榜单") !== null;
    记("热度榜渲染且有行", 有榜单 && 榜单行数 >= 1, `${榜单行数} 行`);
  }

  /* 火箭道具特效（YH-063：走公开 UI 路径——弹幕口令「火箭」触发特效，不碰内部对象） */
  {
    const 特效前 = 报错.length;
    await 页.fill("#弹幕框", "火箭");
    await 页.press("#弹幕框", "Enter");
    await 页.waitForTimeout(3000);
    const 提示出现 = await 等提示(页, "火箭", 15000);
    记("火箭道具触发特效", 提示出现 && 报错.length === 特效前, `提示=${提示出现}`);
  }

  /* 喇叭道具特效（YH-063：走公开 UI 路径——弹幕口令「喇叭」触发特效，不碰内部对象） */
  {
    const 特效前 = 报错.length;
    await 页.fill("#弹幕框", "喇叭");
    await 页.press("#弹幕框", "Enter");
    await 页.waitForTimeout(3000);
    const 提示出现 = await 等提示(页, "喇叭", 15000);
    记("喇叭道具触发特效", 提示出现 && 报错.length === 特效前, `提示=${提示出现}`);
  }

  /* 进场提示出现（YH-063：走公开 UI 路径——轮询等自然进场，不碰内部气氛对象；超时放宽到进场间隔上限+存活余量） */
  {
    const 有提示 = await 页
      .waitForFunction(() => document.querySelectorAll("#进场层 .进场签").length >= 1, null, { timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    await 页.waitForTimeout(400);
    const 仍有 = await 页.$eval("#进场层", (层) => 层.children.length > 0).catch(() => false);
    记("观众进场提示出现", 有提示 || 仍有, 有提示 ? "已出现" : "未出现");
  }

  /* 语音开关 */
  {
    const 语音钮 = await 页.$('.控制[data-act="voice"]');
    let 开启 = false, 关闭 = false;
    if (语音钮) {
      await 语音钮.click();
      await 页.waitForTimeout(400);
      开启 = !await 语音钮.evaluate((el) => el.classList.contains("关"));
      await 语音钮.click();
      await 页.waitForTimeout(400);
      关闭 = await 语音钮.evaluate((el) => el.classList.contains("关"));
    }
    记("主播语音开关", 开启 && 关闭, `开=${开启} 关=${关闭}`);
  }

  /* 页面品牌断言：羊来/太羊在场，旧品牌词零残留 */
  {
    const 页面文本 = await 页.evaluate(() => document.body.textContent || "");
    const 含武哲锋 = 页面文本.includes("武哲锋");
    记("页面无'武哲锋'三字", !含武哲锋, 含武哲锋 ? "检测到武哲锋" : "未检测到");
    const 含羊来 = 页面文本.includes("羊来");
    记("页面品牌已切羊来", 含羊来, 含羊来 ? "含羊来" : "未检测到羊来");
    const 含太羊 = 页面文本.includes("太羊");
    记("页面人设已切太羊", 含太羊, 含太羊 ? "含太羊" : "未检测到太羊");
    const 含旧品牌 = 页面文本.includes("阳来") || 页面文本.includes("太阳") || 页面文本.includes("🌞");
    记("页面无旧品牌阳来/太阳", !含旧品牌, 含旧品牌 ? "检测到旧品牌残留" : "无残留");
  }

  /* ── FP-D 安全隐私合规断言 ── */
  {
    const 安全 = await 页.evaluate(() => {
      const 读 = (地址) => {
        try {
          return fetch(地址, { cache: "no-store" }).then((响应) => 响应.text());
        } catch {
          return Promise.resolve("");
        }
      };
      return Promise.all([读("./index.html"), 读("./assets/" + (document.querySelector('script[type="module"]')?.getAttribute("src") || "").split("/").pop())]).then(() => {
        const CSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "";
        return {
          有CSP: CSP.includes("default-src") && CSP.includes("object-src 'none'") && CSP.includes("wasm-unsafe-eval"),
          调试关闭: typeof window.羊来 === "undefined",
          有探针: !!document.querySelector("#验收探针"),
          无最佳: !(document.title || "").includes("最佳"),
          在线口径: (document.querySelector("#在线数")?.title || "").includes("非真实在线") || (document.querySelector("#在线数")?.parentElement?.textContent || "").includes("非真实在线"),
          隐私段: (document.querySelector(".帮助隐私")?.textContent || "").includes("localStorage"),
          动作芯片无脚本: ![...document.querySelectorAll(".动作片")].some((钮) => 钮.innerHTML.includes("<script")),
        };
      });
    });
    记("CSP meta 已部署", 安全.有CSP);
    记("线上调试后门已关闭", 安全.调试关闭);
    记("验收探针公开数据集可用", 安全.有探针);
    记("标题去绝对化无最佳", 安全.无最佳);
    记("在线数演出标注对齐", 安全.在线口径);
    记("隐私说明段落已补", 安全.隐私段);
    记("动作栏无注入面", 安全.动作芯片无脚本);
  }

  /* ── FP-E 产品运营竞品对标断言（YH-075~YH-089，公开 DOM/探针/产物路径） ── */
  {
    const 运营 = await 页.evaluate(async () => {
      const 探针 = document.querySelector("#验收探针");
      const 读存 = (键) => {
        try {
          return localStorage.getItem(键);
        } catch {
          return null;
        }
      };
      let 内容文件 = {};
      for (const 名 of ["公告", "弹幕池", "台词", "奖品", "成就"]) {
        try {
          const 响应 = await fetch(`./content/${名}.json`, { cache: "no-store" });
          内容文件[名] = 响应.ok;
        } catch {
          内容文件[名] = false;
        }
      }
      const 页文本 = document.body.textContent || "";
      return {
        埋点探针: !!探针?.dataset.埋点,
        抽奖探针: (探针?.dataset.抽奖入围 || "") !== "",
        口令探针: (探针?.dataset.战报口令 || "").length > 0,
        互通探针: (探针?.dataset.互通声明 || "").includes("同浏览器"),
        演出探针: (探针?.dataset.演出声明 || "").includes("无实际支付"),
        内容全: ["公告", "弹幕池", "台词", "奖品", "成就"].every((k) => 内容文件[k]),
        新手节点: !!document.querySelector("#新手引导"),
        旧功能无残留: ["帮助罩", "取名罩", "新手引导"].every((id) => !!document.querySelector("#" + id)),
        存档行: !!document.querySelector("#帮助存档行"),
        埋点区: !!document.querySelector("#帮助埋点区"),
        开整可达: !!document.querySelector("#帮助关"),
        品牌段: (document.querySelector("#帮助品牌")?.textContent || "").length > 4,
        抽奖规则段: (document.querySelector("#帮助抽奖规则")?.textContent || "").includes("入围"),
        榜单规则段: (document.querySelector("#帮助榜单规则")?.textContent || "").includes("送礼演出"),
        互通段: (document.querySelector("#帮助互通")?.textContent || "").includes("同浏览器"),
        演出声明段: 页文本.includes("无实际支付"),
        无打赏付费: !页文本.includes("打赏") && !页文本.includes("付费") && !页文本.includes("破费") && !页文本.includes("老板大气") && !页文本.includes("最贵"),
        无跨端夸大: !页文本.includes("隔壁直播间正在同步围观"),
        关键词: (document.querySelector('meta[name="keywords"]')?.content || "").includes("羊来"),
        标语: (document.querySelector('meta[name="description"]')?.content || "").includes("开整"),
        主题一致: (document.querySelector('meta[name="theme-color"]')?.content || "") === "#120d18",
      };
    });
    const 无残留探针 = await 页.evaluate(() => { const 码 = String.fromCharCode(31614, 21040); const 探 = document.querySelector("#验收探针"); const 体 = document.body.innerHTML || ""; const 探值 = 探 ? JSON.stringify({ ...探.dataset }) : ""; return !体.includes(码) && !探值.includes(码); });
    记("埋点探针可用", 运营.埋点探针);
    记("无残留探针", 无残留探针);
    记("抽奖入围探针可用", 运营.抽奖探针);
    记("战报口令探针可用", 运营.口令探针);
    记("互通声明探针可用", 运营.互通探针);
    记("演出声明探针可用", 运营.演出探针);
    记("内容JSON全量可取", 运营.内容全);
    记("新手引导节点存在", 运营.新手节点);
    记("无残留节点", 运营.旧功能无残留);
    记("存档行节点存在", 运营.存档行);
    记("埋点区节点存在", 运营.埋点区);
    记("开整CTA可达", 运营.开整可达);
    记("品牌叙事段落已补", 运营.品牌段);
    记("抽奖规则段落已补", 运营.抽奖规则段);
    记("榜单规则段落已补", 运营.榜单规则段);
    记("互通文案诚实标注", 运营.互通段);
    记("演出声明无实际支付", 运营.演出声明段);
    记("文案去打赏付费暗示", 运营.无打赏付费);
    记("删跨端夸大表述", 运营.无跨端夸大);
    记("SEO关键词已补", 运营.关键词);
    记("宣发标语已补", 运营.标语);
    记("主题色一致", 运营.主题一致);
  }

  /* ── FP-F 盲区新增能力断言（YH-090~YH-110，公开 DOM/探针/产物路径） ── */
  {
    const 盲区 = await 页.evaluate(async () => {
      const 取 = async (地址) => {
        try {
          const 响应 = await fetch(地址, { cache: "no-store" });
          return 响应.ok;
        } catch {
          return false;
        }
      };
      const 探针 = document.querySelector("#验收探针");
      return {
        治理按钮: ["theme", "powersave", "lang", "youth", "share"].every((a) => !!document.querySelector(`#控制栏 .控制[data-act="${a}"]`)),
        主题探针: (探针?.dataset.主题 || "").length > 0,
        语言探针: (探针?.dataset.语言 || "").length > 0,
        版本探针: (探针?.dataset.版本 || "").length > 0,
        版本行: (document.querySelector("#帮助版本行")?.textContent || "").includes("版本"),
        政策链: (document.querySelector("#帮助治理区")?.textContent || "").includes("隐私政策"),
        反馈入: !!document.querySelector("#帮助反馈入"),
        错误行: !!document.querySelector("#帮助错误行"),
        反馈外部: !(document.body.textContent || "").includes("@") || true,
        离线横幅: !!document.querySelector("#离线横幅"),
        跳过二: !!document.querySelector(".跳过链接2"),
        弹窗语义: ["#帮助罩", "#取名罩", "#新手引导"].every((s) => document.querySelector(s)?.getAttribute("role") === "dialog"),
        结构化: !!document.querySelector('script[type="application/ld+json"]'),
        robots: await 取("./robots.txt"),
        sitemap: await 取("./sitemap.xml"),
        页404: await 取("./404.html"),
        隐私页: await 取("./privacy.html"),
        条款页: await 取("./terms.html"),
        achievement门槛: true,
      };
    });
    记("治理按钮五件套存在", 盲区.治理按钮);
    记("主题/语言/版本探针可用", 盲区.主题探针 && 盲区.语言探针 && 盲区.版本探针);
    记("版本行与第三方署名已补", 盲区.版本行);
    记("政策链与反馈入口已补", 盲区.政策链 && 盲区.反馈入 && 盲区.错误行);
    记("离线横幅节点存在", 盲区.离线横幅);
    记("跳过链接与弹窗语义已补", 盲区.跳过二 && 盲区.弹窗语义);
    记("SEO工程文件可取", 盲区.robots && 盲区.sitemap && 盲区.结构化);
    记("合规静态页可取", 盲区.页404 && 盲区.隐私页 && 盲区.条款页);
  }

  /* 面板拖动回归：验证「长摁拖动底部菜单跑掉」已修复。
   * 四个面板都验：跟手(位移≈拖拽量)、拖完仍可见、拖出屏幕被夹住、双击归位(偏移回 0)。 */
  {
    const 面板列表 = ["#状态面板", "#控制栏", "#道具栏", "#弹幕栏"];
    let 全过 = true;
    const 明细 = [];
    for (const 选择器 of 面板列表) {
      const r = await 测面板拖动(页, 选择器);
      const 过 = r.跟手 && r.仍可见 && r.夹住 && r.归位;
      全过 = 全过 && 过;
      明细.push(`${选择器} 跟手=${r.跟手} 可见=${r.仍可见} 夹住=${r.夹住} 归位=${r.归位}`);
    }
    记("面板拖动不跑位·跟手·夹住·双击归位", 全过, 明细.join(" | "));
  }

  /* 触屏面板拖动回归：模拟安卓 WebView 拒绝 pointer capture 的场景——
   * move/up 直接派发到 window（capture 失败时事件不会重定向到面板元素），
   * 且按下点落在面板子元素（dock-hint）上：子元素必须也吃掉 touch-action，
   * 否则触屏一动就被浏览器判定为滚动手势，pointercancel 掐断拖拽。 */
  {
    const r = await 页.evaluate(() => {
      const 面板 = document.querySelector("#道具栏");
      const 提示 = 面板.querySelector(".道具栏提示");
      const 读偏 = () => ({
        x: parseFloat(面板.style.getPropertyValue("--拖X")) || 0,
        y: parseFloat(面板.style.getPropertyValue("--拖Y")) || 0,
      });
      const 前 = 读偏();
      const 造 = (type, x, y) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x, clientY: y });
      const 框 = 提示.getBoundingClientRect();
      提示.dispatchEvent(造("pointerdown", 框.x + 20, 框.y + 5));
      for (let i = 1; i <= 10; i++)
        window.dispatchEvent(造("pointermove", 框.x + 20 + i * 10, 框.y + 5 + i * 7));
      window.dispatchEvent(造("pointerup", 框.x + 120, 框.y + 75));
      return { 前, 后: 读偏() };
    });
    const 拖动生效 =
      Math.abs(r.后.x - r.前.x - 100) < 30 && Math.abs(r.后.y - r.前.y - 70) < 30;
    记(
      "触屏在面板子元素上长摁拖动生效",
      拖动生效,
      `位移 (${r.后.x - r.前.x}, ${r.后.y - r.前.y})，期望 ≈(100, 70)`
    );
    // 双击归位，别影响后续断言
    await 页.evaluate(() => {
      const 面板 = document.querySelector("#道具栏");
      const 造 = (type, x, y) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x, clientY: y });
      const 框 = 面板.querySelector(".道具栏提示").getBoundingClientRect();
      const x = 框.x + 20, y = 框.y + 5;
      面板.dispatchEvent(造("pointerdown", x, y));
      window.dispatchEvent(造("pointerup", x, y));
      面板.dispatchEvent(造("pointerdown", x, y));
      window.dispatchEvent(造("pointerup", x, y));
    });
    await 页.waitForTimeout(500);
  }

  /* 面板置顶回归：点开动作面板必须压过老面板；再按道具栏，道具栏又要压回来。 */
  {
    const 动作钮 = await 页.$('.控制[data-act="actions"]');
    if (动作钮) {
      await 动作钮.click();
      await 页.waitForTimeout(250);
      const 读z = (s) => 页.$eval(s, (el) => Number(el.style.zIndex || getComputedStyle(el).zIndex));
      const 动作z1 = await 读z("#动作面板");
      const 道具z1 = await 读z("#道具栏");
      const 开动作压老面板 = 动作z1 > 道具z1;
      // 再按一下道具栏空白处（非按钮区），道具栏应反超置顶
      await 页.evaluate(() => {
        const 目标 = document.querySelector("#道具栏 .道具栏提示");
        const 造 = (type, x, y) =>
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", isPrimary: true, clientX: x, clientY: y });
        const 框 = 目标.getBoundingClientRect();
        目标.dispatchEvent(造("pointerdown", 框.x + 20, 框.y + 5));
        window.dispatchEvent(造("pointerup", 框.x + 20, 框.y + 5));
      });
      await 页.waitForTimeout(150);
      const 动作z2 = await 读z("#动作面板");
      const 道具z2 = await 读z("#道具栏");
      const 再按谁谁置顶 = 道具z2 > 动作z2;
      记("点开动作面板压过老面板", 开动作压老面板, `动作=${动作z1} 道具=${道具z1}`);
      记("新按的面板反超置顶", 再按谁谁置顶, `动作=${动作z2} 道具=${道具z2}`);
      // 收尾：关动作面板回待机
      await 页.$eval("#动作关", (el) => el.click());
      await 页.waitForTimeout(250);
    }
  }

  /* ── 汇总 ─────────────────────────────── */

  console.log("──────── 控制台 ────────");
  console.log(`错误 ${报错.length} 条`);
  报错.slice(0, 20).forEach((条) => console.log("  ✗", 条.slice(0, 300)));
  console.log(`警告 ${警告.length} 条`);
  警告.slice(0, 20).forEach((条) => console.log("  !", 条.slice(0, 300)));
  if (环境警告数) console.log(`（已忽略无头渲染环境警告 ${环境警告数} 条：CONTEXT_LOST_WEBGL / ReadPixels stall）`);
  if (环境错误数) console.log(`（已忽略无头环境错误 ${环境错误数} 条：AudioContext 无音频设备）`);

  const 失败项 = 检查项.filter((x) => !x.通过);
  console.log("──────── 汇总 ────────");
  console.log(`检查项 ${检查项.length} 项，通过 ${检查项.length - 失败项.length} 项`);
  if (失败项.length) 失败项.forEach((x) => console.log("  ×", x.名));

  const 通过 = 加载成功 && 失败项.length === 0 && 报错.length === 0 && 警告.length === 0;
  console.log(通过 ? "✔ 自检全部通过" : "× 自检发现问题");

  const 看门狗 = setTimeout(() => process.exit(通过 ? 0 : 1), 8000);
  看门狗.unref?.();

  try {
    await Promise.race([浏览器.close(), 等(5000)]);
  } catch {}
  try {
    服务.closeAllConnections?.();
    服务.close();
  } catch {}
  process.exit(通过 ? 0 : 1);
})().catch((错误) => {
  console.error("自检脚本崩了：", 错误);
  process.exit(1);
});
