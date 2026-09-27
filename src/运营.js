import { 配置 } from "./配置.js";
import { 净化文本 } from "./工具.js";

function 读黑名单() {
  try {
    const 原文 = localStorage.getItem(配置.治理.拉黑键);
    if (!原文) return [];
    const 数据 = JSON.parse(原文);
    return Array.isArray(数据) ? 数据.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function 写黑名单(表) {
  try {
    localStorage.setItem(配置.治理.拉黑键, JSON.stringify(表.slice(0, 配置.治理.上限条数 || 200)));
    return true;
  } catch {
    return false;
  }
}

function 读举报() {
  try {
    const 原文 = localStorage.getItem(配置.治理.举报键);
    if (!原文) return [];
    const 数据 = JSON.parse(原文);
    return Array.isArray(数据) ? 数据.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function 写举报(表) {
  try {
    localStorage.setItem(配置.治理.举报键, JSON.stringify(表.slice(0, 配置.治理.上限条数 || 200)));
    return true;
  } catch {
    return false;
  }
}

export const 治理 = {
  名单() {
    return 读黑名单();
  },
  在名单(昵称) {
    return 读黑名单().includes(净化文本(昵称, 配置.身份.最大长度));
  },
  拉黑(昵称) {
    const 干净 = 净化文本(昵称, 配置.身份.最大长度);
    if (!干净) return false;
    const 表 = 读黑名单();
    if (!表.includes(干净)) {
      表.push(干净);
      写黑名单(表);
    }
    return true;
  },
  取消(昵称) {
    const 干净 = 净化文本(昵称, 配置.身份.最大长度);
    写黑名单(读黑名单().filter((x) => x !== 干净));
  },
  举报(原文) {
    const 干净 = 净化文本(原文, 配置.安全.弹幕最大长度 + 配置.身份.最大长度 + 4);
    if (!干净) return false;
    const 表 = 读举报();
    表.push(干净);
    写举报(表);
    const 切 = 干净.split("：")[0].split(":")[0];
    if (切 && 切 !== 干净) this.拉黑(切);
    return true;
  },
};
