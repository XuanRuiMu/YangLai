import { 配置 } from "./config.js";
import { 净化文本, 夹取 } from "./utils.js";
import { 发布 } from "./events.js";

function 造标签号() {
  try {
    return crypto.randomUUID();
  } catch {
    return `窗${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * 同浏览器多标签互通：弹幕、点赞增量、在线标签心跳。
 * 没有 BroadcastChannel 时静默降级成单标签。
 */
export class 直播厅 {
  constructor() {
    this.标签号 = 造标签号();
    this.频道 = null;
    this.心跳表 = new Map();
    this.在线标签数 = 1;
    this.已销毁 = false;
    this.心跳定时器 = null;
    this.远程点赞窗口 = [];

    try {
      this.频道 = new BroadcastChannel(配置.互通.频道名);
      this.频道.addEventListener("message", (事件) => this.收(事件.data));
    } catch {
      this.频道 = null;
    }
    if (!this.频道) {
      try {
        发布("提示", { 文本: 配置.互通.无通道提示 });
      } catch {
      }
    }

    window.addEventListener("pagehide", () => this.销毁());
    window.addEventListener("beforeunload", () => this.销毁());
    // 心跳必须走真实时钟：渲染循环在标签页切后台时会停摆，
    // 挂在上面的话其他标签会把你误判成离线
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.发心跳();
    });

    this.发心跳();
    this.心跳定时器 = setInterval(() => this.发心跳(), 配置.互通.心跳间隔秒 * 1000);
  }

  广播(负载) {
    if (!this.频道 || this.已销毁) return;
    try {
      this.频道.postMessage({ ...负载, 来自: this.标签号, 时间: Date.now() });
    } catch {
    }
  }

  收(数据) {
    if (!数据 || 数据.来自 === this.标签号) return;
    if (typeof 数据 !== "object" || typeof 数据.类型 !== "string") return;
    switch (数据.类型) {
      case "心跳":
        if (typeof 数据.来自 !== "string" || !数据.来自) return;
        this.心跳表.set(数据.来自, Date.now());
        this.刷新在线();
        break;
      case "离开":
        if (typeof 数据.来自 !== "string" || !数据.来自) return;
        this.心跳表.delete(数据.来自);
        this.刷新在线();
        break;
      case "弹幕": {
        if (typeof 数据.文本 !== "string" || typeof 数据.昵称 !== "string") return;
        const 文本 = 净化文本(数据.文本, 配置.安全.广播弹幕最大长度);
        const 昵称 = 净化文本(数据.昵称, 配置.安全.广播昵称最大长度);
        if (!文本) return;
        发布("远程弹幕", { 文本: 昵称 ? `${昵称}：${文本}` : 文本, 昵称 });
        break;
      }
      case "点赞": {
        const 原始 = Number(数据.增量);
        if (!Number.isFinite(原始) || 原始 <= 0) return;
        const 单次上限 = 配置.安全.远程点赞单次上限;
        const 钳制 = 夹取(Math.floor(原始), 1, 单次上限);
        const 现在 = Date.now();
        this.远程点赞窗口 = this.远程点赞窗口.filter((t) => 现在 - t.时间 < 1000);
        const 窗口和 = this.远程点赞窗口.reduce((和, 条) => 和 + 条.增量, 0);
        const 每秒上限 = 配置.安全.远程点赞每秒上限;
        const 剩余 = Math.max(0, 每秒上限 - 窗口和);
        const 实际 = Math.min(钳制, 剩余);
        if (实际 <= 0) return;
        this.远程点赞窗口.push({ 时间: 现在, 增量: 实际 });
        发布("远程点赞", { 增量: 实际 });
        break;
      }
      default:
        break;
    }
  }

  发弹幕(文本, 昵称) {
    this.广播({ 类型: "弹幕", 文本, 昵称 });
  }

  发点赞(增量) {
    if (!增量) return;
    this.广播({ 类型: "点赞", 增量 });
  }

  发心跳() {
    if (this.已销毁) return;
    this.广播({ 类型: "心跳" });
    this.心跳表.set(this.标签号, Date.now());
    this.刷新在线();
  }

  刷新在线() {
    const 现在 = Date.now();
    const 超时 = 配置.互通.心跳超时毫秒;
    for (const [号, 时间] of this.心跳表) {
      if (现在 - 时间 > 超时) this.心跳表.delete(号);
    }
    const 数 = Math.max(1, this.心跳表.size);
    if (数 !== this.在线标签数) {
      this.在线标签数 = 数;
      发布("标签数变化", { 数 });
    }
  }

  销毁() {
    if (this.已销毁) return;
    if (this.心跳定时器) {
      clearInterval(this.心跳定时器);
      this.心跳定时器 = null;
    }
    // 必须先广播「离开」再置 已销毁：广播() 内有「已销毁 则跳过」的保护，
    // 若先置 true，离开消息会被直接丢掉，其他标签收不到 → 在线数不回落。
    this.广播({ 类型: "离开" });
    this.已销毁 = true;
    // BroadcastChannel 的消息是异步投递的；延迟到下一拍再关频道，确保「离开」送达。
    setTimeout(() => {
      try {
        this.频道?.close();
      } catch {
        /* 关过了 */
      }
      this.频道 = null;
    }, 200);
  }
}
