import { 配置 } from "./配置.js";

const 键 = (名) => `${配置.内容.目录}/${名}.json`;

async function 取一(名) {
  try {
    const 响应 = await fetch(键(名), { cache: "force-cache" });
    if (!响应.ok) return null;
    return await 响应.json();
  } catch {
    return null;
  }
}

export async function 拉取内容() {
  try {
    const [公告, 弹幕池, 台词, 奖品, 成就] = await Promise.all([
      取一("公告"), 取一("弹幕池"), 取一("台词"), 取一("奖品"), 取一("成就"),
    ]);
    if (Array.isArray(公告) && 公告.length) 配置.公告条.文案池 = 公告;
    if (Array.isArray(弹幕池) && 弹幕池.length) 配置.弹幕池 = 弹幕池;
    if (台词 && typeof 台词 === "object") {
      for (const [k, v] of Object.entries(台词)) {
        if (Array.isArray(v) && v.length && Array.isArray(配置.台词[k])) 配置.台词[k] = v;
      }
    }
    if (Array.isArray(奖品) && 奖品.length) 配置.幸运观众奖品 = 奖品;
    if (Array.isArray(成就) && 成就.length) 配置.成就列表 = 成就;
  } catch {
  }
}
