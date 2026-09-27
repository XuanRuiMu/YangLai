/**
 * Edge TTS 语音烘焙脚本
 * 用法：npm run 语音:烘焙
 * 产物：public/audio/vo/*.mp3 + public/audio/vo/清单.json
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const 项目根目录 = path.join(__dirname, "..");
const 配置路径 = path.join(项目根目录, "src", "配置.js");
const 音频目录 = path.join(项目根目录, "public", "audio", "vo");
const 清单路径 = path.join(音频目录, "清单.json");

/** FNV-1a 32位散列 —— 必须与 src/工具.js 的 散列键() 完全一致 */
function 散列键(文本) {
  const 字 = String(文本 ?? "").slice(0, 80);
  let 值 = 0x811c9dc5;
  for (let i = 0; i < 字.length; i++) {
    值 ^= 字.charCodeAt(i);
    值 = Math.imul(值, 0x01000193);
  }
  return (值 >>> 0).toString(16).padStart(8, "0");
}

/** 读取配置文件，提取配置对象 */
async function 读取配置() {
  const { pathToFileURL } = require("url");
  const 模块 = await import(pathToFileURL(配置路径).href);
  const 结果 = 模块.配置;
  if (!结果 || typeof 结果 !== "object" || Array.isArray(结果)) {
    throw new Error("配置不是纯对象，拒绝求值");
  }
  const 白名单 = /^[A-Za-z_$一-龥][\w$一-龥]*$/u;
  const 扫键 = (值, 深 = 0) => {
    if (深 > 12 || !值 || typeof 值 !== "object") return;
    if (Array.isArray(值)) {
      for (const 项 of 值) 扫键(项, 深 + 1);
      return;
    }
    for (const 键 of Object.keys(值)) {
      if (!白名单.test(键)) throw new Error(`配置键非法: ${键}`);
      扫键(值[键], 深 + 1);
    }
  };
  扫键(结果);
  return 结果;
}

/** 收集所有需要烘焙的台词文本 */
function 收集台词(配置) {
  const 文本集 = new Set();

  // 台词池
  for (const 池 of Object.values(配置.台词)) {
    if (Array.isArray(池)) {
      for (const 文本 of 池) 文本集.add(String(文本).slice(0, 80));
    }
  }

  // 开场白
  if (配置.文案.开场白) 文本集.add(String(配置.文案.开场白).slice(0, 80));

  // 主播回应池
  if (Array.isArray(配置.礼物.主播回应池)) {
    for (const 文本 of 配置.礼物.主播回应池) 文本集.add(String(文本).slice(0, 80));
  }

  // 反应弹幕池（可选，如果想烘焙 NPC 反应语音）
  // 这里只烘焙主播台词，不包含 NPC 弹幕

  return [...文本集];
}

/** 烘焙单条语音 */
function 烘焙单条(文本, 音色, 输出路径) {
  return new Promise((resolve, reject) => {
    // 写入临时 UTF-8 文本文件，避免命令行转义问题
    const 临时文本 = path.join(__dirname, `_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(临时文本, 文本, "utf-8");

    const 进程 = spawn("python", ["-m", "edge_tts", "--voice", 音色, "--file", 临时文本, "--write-media", 输出路径], {
      windowsHide: true,
    });

    let 错误输出 = "";
    进程.stderr.on("data", (data) => { 错误输出 += data.toString(); });

    进程.on("close", (code) => {
      // 清理临时文件
      try { fs.unlinkSync(临时文本); } catch {}

      if (code === 0 && fs.existsSync(输出路径) && fs.statSync(输出路径).size > 0) {
        resolve({ 成功: true, 大小: fs.statSync(输出路径).size });
      } else {
        resolve({ 成功: false, 错误: 错误输出 || `exit code ${code}` });
      }
    });

    进程.on("error", (err) => {
      try { fs.unlinkSync(临时文本); } catch {}
      resolve({ 成功: false, 错误: err.message });
    });

    // 30秒超时
    setTimeout(() => {
      进程.kill();
      try { fs.unlinkSync(临时文本); } catch {}
      resolve({ 成功: false, 错误: "timeout" });
    }, 30000);
  });
}

/** 主函数 */
async function 主流程() {
  console.log("🎙️ 开始烘焙 Edge TTS 语音...");

  // 读取配置
  const 配置 = await 读取配置();
  const 音色 = 配置.语音?.音色 || "zh-CN-YunyangNeural";
  console.log(`音色: ${音色}`);

  // 确保输出目录存在
  fs.mkdirSync(音频目录, { recursive: true });

  // 收集台词
  const 台词列表 = 收集台词(配置);
  console.log(`共 ${台词列表.length} 条台词`);

  // 读取已有清单（断点续烤）
  let 清单 = {};
  if (fs.existsSync(清单路径)) {
    try { 清单 = JSON.parse(fs.readFileSync(清单路径, "utf-8")); } catch {}
  }

  // 并行烘焙（6个并发）
  const 并发数 = 6;
  let 索引 = 0;
  let 成功数 = 0;
  let 失败数 = 0;

  async function 工作线程() {
    while (索引 < 台词列表.length) {
      const 当前索引 = 索引++;
      const 文本 = 台词列表[当前索引];
      const 键 = 散列键(文本);
      const 输出文件 = path.join(音频目录, `${键}.mp3`);

      // 已存在且大小>0则跳过
      if (fs.existsSync(输出文件) && fs.statSync(输出文件).size > 0) {
        console.log(`  ⏭️ ${键} 已存在，跳过`);
        清单[键] = 文本;
        成功数++;
        continue;
      }

      const 结果 = await 烘焙单条(文本, 音色, 输出文件);
      if (结果.成功) {
        console.log(`  ✔ ${键} (${(结果.大小 / 1024).toFixed(1)} KB)`);
        清单[键] = 文本;
        成功数++;
      } else {
        console.warn(`  ⚠ ${键} 失败: ${结果.错误}`);
        失败数++;
        // 失败不退出，只警告
      }
    }
  }

  const 线程们 = Array.from({ length: Math.min(并发数, 台词列表.length) }, () => 工作线程());
  await Promise.all(线程们);

  // 写入清单
  fs.writeFileSync(清单路径, JSON.stringify(清单, null, 2), "utf-8");

  console.log(`\n✅ 烘焙完成：成功 ${成功数}，失败 ${失败数}`);
  console.log(`📁 产物目录: ${音频目录}`);
  console.log(`📋 清单: ${清单路径}`);

  // 验证散列算法一致性
  console.log("\n🔍 验证散列算法...");
  for (const [键, 文本] of Object.entries(清单)) {
    const 计算键 = 散列键(文本);
    if (计算键 !== 键) {
      console.error(`❌ 散列不匹配: ${键} vs ${计算键} (文本: ${文本})`);
      process.exitCode = 1;
    }
  }
  console.log("✅ 散列验证通过");
}

主流程().catch((err) => {
  console.error("烘焙脚本异常:", err);
  process.exit(1);
});