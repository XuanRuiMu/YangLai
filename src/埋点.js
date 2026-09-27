import { 配置 } from "./配置.js";
import { 发布, 订阅 } from "./事件.js";

function 读表() {
  try {
    const 原文 = localStorage.getItem(配置.埋点.存储键);
    if (!原文) return {};
    const 数据 = JSON.parse(原文);
    return 数据 && typeof 数据 === "object" ? 数据 : {};
  } catch {
    return {};
  }
}

function 写表(表) {
  try {
    const 键 = Object.keys(表).slice(-配置.埋点.上限条数);
    const 裁 = {};
    for (const k of 键) 裁[k] = 表[k];
    localStorage.setItem(配置.埋点.存储键, JSON.stringify(裁));
  } catch {
  }
}

export const 埋点 = {
  计(事件, 步数 = 1) {
    if (!配置.埋点.开启) return;
    if (!配置.埋点.事件.includes(事件)) return;
    const 表 = 读表();
    表[事件] = (Number(表[事件]) || 0) + 步数;
    写表(表);
  },
  读() {
    return 读表();
  },
};

export function 绑定埋点() {
  订阅("点赞", ({ 远程 }) => {
    if (!远程) 埋点.计("点赞");
  });
  订阅("道具命中", ({ 道具 }) => {
    if (道具?.分类 === "投送") 埋点.计("献礼");
    else 埋点.计("投掷");
  });
  订阅("本地弹幕", () => 埋点.计("弹幕"));
  订阅("抽奖展示", () => 埋点.计("抽奖"));
  订阅("战报", () => 埋点.计("战报"));
  订阅("分享", () => 埋点.计("分享"));
}
