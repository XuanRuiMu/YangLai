import * as THREE from "three";

export const 夹取 = (值, 最小, 最大) => Math.min(最大, Math.max(最小, 值));
export const 随机 = (最小, 最大) => 最小 + Math.random() * (最大 - 最小);
export const 随机整数 = (最小, 最大) => Math.floor(随机(最小, 最大 + 1));
export const 线性插值 = (a, b, t) => a + (b - a) * t;
export const 缓出 = (t) => 1 - Math.pow(1 - t, 3);
export const 缓入 = (t) => t * t * t;
export const 缓入缓出 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const 正负极 = () => (Math.random() < 0.5 ? -1 : 1);

export function 洗牌(数组) {
  const 副本 = [...数组];
  for (let i = 副本.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [副本[i], 副本[j]] = [副本[j], 副本[i]];
  }
  return 副本;
}

/** 每帧无关的近似阻尼插值，帧率波动时也能保持手感一致 */
export function 阻尼插值(当前, 目标, 平滑系数, 步长) {
  return 线性插值(当前, 目标, 1 - Math.exp(-平滑系数 * 步长));
}

/* ── 表情 / 图形 纹理缓存 ───────────────────────────── */

const 贴图缓存 = new Map();

function 建画布(边长) {
  const 画布 = document.createElement("canvas");
  画布.width = 边长;
  画布.height = 边长;
  return 画布;
}

/** 把任意字符串（多为 emoji）渲染成带描边的方形贴图 */
export function 取表情纹理(字符, 边长 = 128) {
  const 键 = `${字符}@${边长}`;
  if (贴图缓存.has(键)) return 贴图缓存.get(键);

  const 画布 = 建画布(边长);
  const 笔 = 画布.getContext("2d");
  笔.textAlign = "center";
  笔.textBaseline = "middle";
  笔.font = `${Math.round(边长 * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
  笔.shadowColor = "rgba(0,0,0,0.45)";
  笔.shadowBlur = 边长 * 0.08;
  笔.shadowOffsetY = 边长 * 0.03;
  笔.fillText(字符, 边长 / 2, 边长 * 0.54);

  const 纹理 = new THREE.CanvasTexture(画布);
  纹理.colorSpace = THREE.SRGBColorSpace;
  纹理.anisotropy = 4;
  纹理.needsUpdate = true;
  贴图缓存.set(键, 纹理);
  return 纹理;
}

/** 柔和圆点，粒子系统用 */
export function 取圆点纹理(边长 = 64) {
  const 键 = `圆点@${边长}`;
  if (贴图缓存.has(键)) return 贴图缓存.get(键);

  const 画布 = 建画布(边长);
  const 笔 = 画布.getContext("2d");
  const 渐变 = 笔.createRadialGradient(边长 / 2, 边长 / 2, 0, 边长 / 2, 边长 / 2, 边长 / 2);
  渐变.addColorStop(0, "rgba(255,255,255,1)");
  渐变.addColorStop(0.45, "rgba(255,255,255,0.85)");
  渐变.addColorStop(1, "rgba(255,255,255,0)");
  笔.fillStyle = 渐变;
  笔.fillRect(0, 0, 边长, 边长);

  const 纹理 = new THREE.CanvasTexture(画布);
  纹理.colorSpace = THREE.SRGBColorSpace;
  贴图缓存.set(键, 纹理);
  return 纹理;
}

/** 不规则溅渍，污渍贴片用（几种形状随机） */
export function 取溅渍纹理(第几号 = 0, 边长 = 128) {
  const 键 = `溅渍${第几号}@${边长}`;
  if (贴图缓存.has(键)) return 贴图缓存.get(键);

  const 画布 = 建画布(边长);
  const 笔 = 画布.getContext("2d");
  const 心 = 边长 / 2;
  const 瓣数 = 6 + 第几号 * 2;
  const 随机种子 = 第几号 * 977 + 13;
  const 伪随机 = (i) => {
    const x = Math.sin(随机种子 + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  笔.fillStyle = "#ffffff";
  笔.beginPath();
  for (let i = 0; i <= 瓣数; i++) {
    const 角 = (i / 瓣数) * Math.PI * 2;
    const 半径 = 心 * (0.5 + 伪随机(i) * 0.42);
    const x = 心 + Math.cos(角) * 半径;
    const y = 心 + Math.sin(角) * 半径;
    if (i === 0) 笔.moveTo(x, y);
    else 笔.quadraticCurveTo(心 + Math.cos(角 - 0.2) * 半径 * 1.25, 心 + Math.sin(角 - 0.2) * 半径 * 1.25, x, y);
  }
  笔.closePath();
  笔.fill();

  // 周围甩几个小点
  for (let i = 0; i < 8; i++) {
    const 角 = 伪随机(i + 40) * Math.PI * 2;
    const 距 = 心 * (0.6 + 伪随机(i + 80) * 0.35);
    笔.beginPath();
    笔.arc(心 + Math.cos(角) * 距, 心 + Math.sin(角) * 距, 边长 * (0.015 + 伪随机(i + 120) * 0.035), 0, Math.PI * 2);
    笔.fill();
  }

  const 纹理 = new THREE.CanvasTexture(画布);
  纹理.colorSpace = THREE.SRGBColorSpace;
  贴图缓存.set(键, 纹理);
  return 纹理;
}

/* ── 小工具 ─────────────────────────────────────────── */

export function 转屏幕坐标(世界坐标, 相机, 宽, 高) {
  const 向量 = 世界坐标.clone().project(相机);
  return {
    x: (向量.x * 0.5 + 0.5) * 宽,
    y: (-向量.y * 0.5 + 0.5) * 高,
    在视野内: 向量.z < 1,
  };
}

/** YH-013根因治理：全链路统一走画布矩形归一化，消除舞台宽高与矩形两套坐标系 */
export function 屏幕转归一化(客户端x, 客户端y, 画布) {
  const 矩形 = 画布.getBoundingClientRect();
  const 宽 = 矩形.width || 1;
  const 高 = 矩形.height || 1;
  return new THREE.Vector2(
    ((客户端x - 矩形.left) / 宽) * 2 - 1,
    -((客户端y - 矩形.top) / 高) * 2 + 1
  );
}

/** 世界坐标转客户端像素（含画布偏移，全屏时与旧算法一致） */
export function 世界转客户端(世界坐标, 相机, 画布) {
  const 矩形 = 画布.getBoundingClientRect();
  const 向量 = 世界坐标.clone().project(相机);
  return {
    x: 矩形.left + (向量.x * 0.5 + 0.5) * (矩形.width || 1),
    y: 矩形.top + (-向量.y * 0.5 + 0.5) * (矩形.height || 1),
    在视野内: 向量.z < 1,
  };
}

/** 文件名安全：去路径分隔符与非法字符，防歧义 */
export function 文件名安全(文本, 最大长度 = 12) {
  return 净化文本(文本, 最大长度).replace(/[\\/:*?"<>|]/g, "").trim() || "路人甲";
}

export function 格式化时长(秒) {
  const 分 = Math.floor(秒 / 60);
  const 余秒 = Math.floor(秒 % 60);
  return `${分}:${String(余秒).padStart(2, "0")}`;
}

export function 格式化数字(数) {
  return 数 >= 10000 ? (数 / 10000).toFixed(1) + "万" : String(数);
}

/** 截掉可能的危险字符，弹幕与提示一律走这里 */
export function 净化文本(文本, 最大长度 = 40) {
  const 干净 = String(文本 ?? "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u061C]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return [...干净].slice(0, 最大长度).join("");
}

/** 轻量敏感词过滤：config词表可配，默认关闭名单过严 */
export function 过滤敏感词(文本, 词表 = [], 替换符 = "✿") {
  const 表 = Array.isArray(词表) ? 词表 : [];
  const 符 = typeof 替换符 === "string" && 替换符 ? 替换符 : "✿";
  let 结果 = String(文本 ?? "");
  let 命中 = false;
  for (const 词 of 表) {
    if (typeof 词 !== "string" || !词) continue;
    if (结果.toLowerCase().includes(String(词).toLowerCase())) {
      命中 = true;
      const 替 = 符.repeat(Math.max(1, [...词].length));
      const 转义 = String(词).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      结果 = 结果.replace(new RegExp(转义, "gi"), 替);
    }
  }
  return { 文本: 结果, 命中 };
}

/**
 * 台词文本 → 8 位散列，用来给烘焙好的语音片段命名。
 * FNV-1a 32 位，Node 和浏览器跑出来是同一个结果，烘焙脚本和运行时靠它对暗号。
 */
export function 散列键(文本) {
  const 字 = String(文本 ?? "");
  let 值 = 0x811c9dc5;
  for (let i = 0; i < 字.length; i++) {
    值 ^= 字.charCodeAt(i);
    值 = Math.imul(值, 0x01000193);
  }
  return (值 >>> 0).toString(16).padStart(8, "0");
}

/** 把 {占位符} 替换掉，缺参数时留空而不是留下花括号 */
export function 填词(模板, 词表 = {}) {
  return String(模板 ?? "").replace(/\{([一-龥A-Za-z0-9_]+)\}/g, (原, 键) => {
    if (键 === "__proto__" || 键 === "constructor" || 键 === "prototype") return "";
    if (!Object.prototype.hasOwnProperty.call(Object(词表), 键)) return "";
    return 词表[键] ?? "";
  });
}
