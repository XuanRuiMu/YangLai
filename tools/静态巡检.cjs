/** 公网访问端到端验证：真实浏览器加载线上地址，确认模型能正常渲染 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const 网址 = process.argv[2] || "https://16dac940995d4908a9656e6a699a43ed.app.workbuddy.link/";
const 日志 = path.join(__dirname, "_public_check.log");

(async () => {
  const 浏览器 = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const 页 = await 浏览器.newPage({ viewport: { width: 1280, height: 800 } });

  const 报错 = [];
  页.on("pageerror", (e) => 报错.push("pageerror: " + e.message));
  页.on("console", (m) => { if (m.type() === "error") 报错.push(m.text()); });

  const 开始 = Date.now();
  await 页.goto(网址, { waitUntil: "load", timeout: 90000 });

  let 加载成功 = true;
  try {
    await 页.waitForSelector("#加载罩.隐藏", { timeout: 120000 });
  } catch {
    加载成功 = false;
  }
  const 加载耗时 = Math.round((Date.now() - 开始) / 1000);
  const 文字 = await 页.textContent("#加载文").catch(() => "(元素已移除，说明加载成功)");
  const 标题 = await 页.textContent(".brand-text strong").catch(() => "?");

  await 页.waitForTimeout(1500);
  await 页.screenshot({ path: path.join(__dirname, "_shots", "10-线上实拍.png") });

  const 性能 = await 页.evaluate(async () => {
    const 性能门限 = { 最大内容绘制毫秒: 4000 };
    const 资源 = performance.getEntriesByType("resource");
    const 首屏字节 = 资源
      .filter((项) => /\.(js|css)(\?|$)/.test(项.name))
      .reduce((和, 项) => 和 + (项.transferSize || 项.encodedBodySize || 0), 0);
    const 最大内容绘制 = await new Promise((完成) => {
      try {
        const 观察 = new PerformanceObserver((列表) => {
          const 条 = 列表.getEntries().pop();
          完成(条 ? Math.round(条.startTime) : -1);
        });
        观察.observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => {
          观察.disconnect();
          完成(-1);
        }, 3000);
      } catch {
        完成(-1);
      }
    });
    const 长任务 = performance.getEntriesByType("longtask").length;
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
    return { 首屏字节, 最大内容绘制, 长任务, 输入延迟 };
  });

  fs.writeFileSync(
    日志,
    `网址: ${网址}\n模型加载: ${加载成功 ? "✔ 成功" : "× 失败"}（${加载耗时}s）\n页面标题: ${标题}\n首屏JS+CSS传输: ${(性能.首屏字节 / 1024).toFixed(0)} KB\n最大内容绘制: ${性能.最大内容绘制}ms\n输入延迟: ${性能.输入延迟}ms\n长任务: ${性能.长任务} 个\n控制台错误 ${报错.length} 条\n${报错.slice(0, 5).join("\n")}\n`
  );

  await 浏览器.close().catch(() => {});
  process.exit(加载成功 && 报错.length === 0 ? 0 : 1);
})().catch((e) => {
  fs.writeFileSync(日志, `[脚本异常] ${e.message}\n`);
  process.exit(1);
});
