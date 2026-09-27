import { 配置 } from "./配置.js";
import { 净化文本, 随机整数 } from "./工具.js";

const 键 = () => 配置.身份.存储键;
const 旧键 = () => 配置.身份.旧存储键 || "阳来_昵称_v1";

function 默认昵称() {
  return `${配置.身份.跳过前缀}-${随机整数(1000, 9999)}`;
}

function 迁移旧身份() {
  try {
    if (localStorage.getItem(键())) return;
    const 旧 = localStorage.getItem(旧键());
    if (!旧) return;
    const 数据 = JSON.parse(旧);
    if (!数据 || typeof 数据.昵称 !== "string") return;
    localStorage.setItem(键(), JSON.stringify({ 昵称: 净化文本(数据.昵称, 配置.身份.最大长度), 已确认: !!数据.已确认, 版本: 配置.身份.版本, 时间: 数据.时间 || Date.now() }));
    localStorage.removeItem(旧键());
  } catch {
  }
}

export function 读身份() {
  try {
    迁移旧身份();
    const 原文 = localStorage.getItem(键());
    if (!原文) return { 昵称: "", 已确认: false };
    const 数据 = JSON.parse(原文);
    if (!数据 || typeof 数据.昵称 !== "string") return { 昵称: "", 已确认: false };
    if (数据.版本 !== 配置.身份.版本) return { 昵称: "", 已确认: false };
    return { 昵称: 净化文本(数据.昵称, 配置.身份.最大长度), 已确认: !!数据.已确认 };
  } catch {
    return { 昵称: "", 已确认: false };
  }
}

export function 写身份(昵称, 已确认 = true) {
  const 干净 = 净化文本(昵称, 配置.身份.最大长度) || 默认昵称();
  const 数据 = { 昵称: 干净, 已确认: !!已确认, 版本: 配置.身份.版本, 时间: Date.now() };
  try {
    localStorage.setItem(键(), JSON.stringify(数据));
  } catch {
  }
  return 数据;
}

export function 跳过取名() {
  return 写身份(默认昵称(), true);
}
