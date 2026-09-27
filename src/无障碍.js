import { 配置 } from "./配置.js";
import { 发布 } from "./事件.js";

function 取标签(动作, 回退) {
  return 配置.可访问性?.控制按钮标签?.[动作] || 回退 || 动作;
}

export function 标注舞台语义() {
  try {
    const 画布 = document.querySelector("#舞台");
    if (画布 && !画布.getAttribute("aria-label")) {
      画布.setAttribute("role", "img");
      画布.setAttribute("aria-label", 配置.可访问性.舞台语义);
    }
    const 栏 = document.querySelector("#控制栏");
    if (栏 && !栏.getAttribute("aria-label")) 栏.setAttribute("aria-label", "直播间控制栏");
    for (const 钮 of document.querySelectorAll("#控制栏 .控制[data-act]")) {
      const 动作 = 钮.dataset.act;
      if (!钮.getAttribute("aria-label")) 钮.setAttribute("aria-label", 取标签(动作, 钮.title));
      if (动作 === "spin" || 动作 === "sound" || 动作 === "disco" || 动作 === "voice" || 动作 === "powersave") {
        if (!钮.hasAttribute("aria-pressed")) 钮.setAttribute("aria-pressed", "false");
      }
    }
    const 关 = document.querySelector("#关注钮");
    if (关 && !关.getAttribute("aria-label")) 关.setAttribute("aria-label", "关注主播");
    const 开整 = document.querySelector("#帮助关");
    if (开整) {
      开整.setAttribute("aria-label", 配置.直播间.宣发标语 || "开整");
      if (!开整.textContent || 开整.textContent === "知道了，开整！") {
        try {
          if (配置.直播间.开整按钮) 开整.textContent = 配置.直播间.开整按钮;
        } catch {
        }
      }
    }
    const 新手 = document.querySelector("#新手引导");
    if (新手) 新手.setAttribute("aria-label", 配置.新手引导.标题);
  } catch {
  }
}

export function 同步开关语义(动作, 开启) {
  try {
    const 钮 = document.querySelector(`#控制栏 .控制[data-act="${动作}"]`);
    if (钮) 钮.setAttribute("aria-pressed", 开启 ? "true" : "false");
  } catch {
  }
}

export function 播报无障碍(文本) {
  发布("提示", { 文本 });
}
