import { 配置 } from "./配置.js";
import { 发布 } from "./事件.js";

function 读存(键, 回退) {
  try {
    const 值 = localStorage.getItem(键);
    return 值 === null ? 回退 : 值;
  } catch {
    return 回退;
  }
}

function 写存(键, 值) {
  try {
    localStorage.setItem(键, 值);
  } catch {
  }
}

export const 错误收集 = {
  记(类型, 信息) {
    try {
      const 原文 = localStorage.getItem(配置.错误收集.存储键);
      const 表 = 原文 ? JSON.parse(原文) : [];
      const 列 = Array.isArray(表) ? 表 : [];
      列.push({ 时间: new Date().toISOString(), 类型, 信息: String(信息 || "").slice(0, 300) });
      const 裁 = 列.slice(-配置.错误收集.上限条数);
      localStorage.setItem(配置.错误收集.存储键, JSON.stringify(裁));
    } catch {
    }
  },
  读() {
    try {
      const 原文 = localStorage.getItem(配置.错误收集.存储键);
      const 表 = 原文 ? JSON.parse(原文) : [];
      return Array.isArray(表) ? 表 : [];
    } catch {
      return [];
    }
  },
  清() {
    try {
      localStorage.removeItem(配置.错误收集.存储键);
    } catch {
    }
  },
};

export function 绑定全局错误() {
  try {
    window.addEventListener("error", (事件) => {
      错误收集.记("error", 事件?.message || "未知错误");
    });
    window.addEventListener("unhandledrejection", (事件) => {
      错误收集.记("unhandledrejection", String(事件?.reason?.message || 事件?.reason || "未知拒绝"));
    });
  } catch {
  }
}

export function 当前未成年() {
  return 读存(配置.未成年.存储键, "") === "1";
}

export function 切换未成年() {
  const 开 = !当前未成年();
  写存(配置.未成年.存储键, 开 ? "1" : "0");
  return 开;
}

export function 当前主题() {
  const 存 = 读存(配置.主题.存储键, "");
  return 存 === 配置.主题.浅色 ? 配置.主题.浅色 : 配置.主题.深色;
}

export function 应用主题(主题) {
  try {
    document.documentElement.dataset.主题 = 主题 === 配置.主题.浅色 ? "浅色" : "深色";
  } catch {
  }
  写存(配置.主题.存储键, 主题);
}

export function 切换主题() {
  const 下 = 当前主题() === 配置.主题.浅色 ? 配置.主题.深色 : 配置.主题.浅色;
  应用主题(下);
  return 下;
}

export function 当前省电() {
  return 读存(配置.省电.存储键, "") === "1";
}

export function 切换省电() {
  const 开 = !当前省电();
  写存(配置.省电.存储键, 开 ? "1" : "0");
  发布("省电", { 开启: 开 });
  return 开;
}

export function 当前语言() {
  const 存 = 读存(配置.语言.存储键, "");
  return 配置.语言.可选.includes(存) ? 存 : 配置.语言.默认;
}

export function 切换语言() {
  const 下 = 当前语言() === "zh-CN" ? "en" : "zh-CN";
  写存(配置.语言.存储键, 下);
  发布("语言", { 语言: 下 });
  return 下;
}

export function 反馈保存(文本) {
  try {
    const 干净 = String(文本 || "").trim().slice(0, 200);
    if (!干净) return false;
    const 原文 = localStorage.getItem(配置.反馈.存储键);
    const 表 = 原文 ? JSON.parse(原文) : [];
    const 列 = Array.isArray(表) ? 表 : [];
    列.push({ 时间: new Date().toISOString(), 文本: 干净 });
    localStorage.setItem(配置.反馈.存储键, JSON.stringify(列.slice(-配置.反馈.上限条数)));
    return true;
  } catch {
    return false;
  }
}

export function 监视离线(在线回调, 离线回调) {
  try {
    window.addEventListener("online", () => {
      try {
        在线回调 && 在线回调();
      } catch {
      }
    });
    window.addEventListener("offline", () => {
      try {
        离线回调 && 离线回调();
      } catch {
      }
    });
  } catch {
  }
}
