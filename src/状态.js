import { 配置, 取称号 } from "./配置.js";
import { 夹取 } from "./工具.js";
import { 发布 } from "./事件.js";

/** 直播间状态：好感度、愤怒值、统计与战绩 */
export class 状态 {
  constructor() {
    this.好感 = 配置.好感度.初始值;
    this.愤怒 = 配置.愤怒.初始值;
    this.点赞数 = 0;
    this.连击 = 0;
    this.投掷数 = 0;
    this.献礼数 = 0;
    this.最高连击 = 0;
    this.暴怒剩余 = 0;
    this.在场秒 = 0;
    this.上次称号 = 取称号(this.好感);
    this.存档 = this.读档();
    this.人气加成 = 0;
    this.人气显示 = 配置.人气.基础;
    this.番茄时间戳 = [];
    this.番茄雨上次 = -1;
  }

  /* ── 持久化 ─────────────────────────── */

  读档() {
    try {
      const 原文 = localStorage.getItem(配置.战绩.存储键);
      if (!原文) return this.内存档 || null;
      const 数据 = JSON.parse(原文);
      if (!数据 || 数据.版本 !== 配置.战绩.版本) return this.内存档 || null;
      return 数据;
    } catch {
      return this.内存档 || null;
    }
  }

  存档写入() {
    const 数据 = {
      版本: 配置.战绩.版本,
      累计点赞: (this.存档?.累计点赞 || 0) + this.点赞数,
      累计投掷: (this.存档?.累计投掷 || 0) + this.投掷数,
      累计献礼: (this.存档?.累计献礼 || 0) + this.献礼数,
      最高连击: Math.max(this.存档?.最高连击 || 0, this.最高连击),
      最高好感: Math.max(this.存档?.最高好感 || 0, this.好感),
      来访次数: (this.存档?.来访次数 || 0) + 1,
      上次来访: Date.now(),
    };
    try {
      localStorage.setItem(配置.战绩.存储键, JSON.stringify(数据));
      this.存档 = 数据;
      this.内存档 = 数据;
      this.存档仅内存 = false;
    } catch {
      this.内存档 = 数据;
      this.存档 = 数据;
      this.存档仅内存 = true;
      发布("提示", { 文本: 配置.存档.本会话有效 });
    }
  }

  get 存档状态提示() {
    return this.存档仅内存 ? 配置.存档.内存兜底 : "";
  }

  导出存档() {
    const 数据 = this.存档 || this.内存档 || {};
    const 文本 = JSON.stringify({ 战绩: 数据, 时间: Date.now() });
    const 链接 = document.createElement("a");
    链接.href = URL.createObjectURL(new Blob([文本], { type: "application/json" }));
    链接.download = `羊来-存档-${new Date().toISOString().slice(0, 10)}.json`;
    链接.click();
    setTimeout(() => URL.revokeObjectURL(链接.href), 4000);
    return true;
  }

  导入存档(文本) {
    try {
      const 数据 = JSON.parse(String(文本 || ""));
      const 战绩 = 数据?.战绩 || 数据;
      if (!战绩 || typeof 战绩 !== "object") return false;
      this.内存档 = 战绩;
      this.存档 = 战绩;
      try {
        localStorage.setItem(配置.战绩.存储键, JSON.stringify(战绩));
        this.存档仅内存 = false;
      } catch {
        this.存档仅内存 = true;
      }
      return true;
    } catch {
      return false;
    }
  }

  /* ── 数值变更 ───────────────────────── */

  加好感(增量) {
    if (!增量) return;
    this.好感 = 夹取(this.好感 + 增量, 配置.好感度.最小值, 配置.好感度.最大值);
    this.检查称号();
  }

  加愤怒(增量) {
    if (!增量) return;
    this.愤怒 = 夹取(this.愤怒 + 增量, 0, 配置.愤怒.最大值);
    if (this.愤怒 >= 配置.愤怒.暴怒阈值 && this.暴怒剩余 <= 0) this.进入暴怒();
  }

  /** 口令「生气」专用：暴怒中延长不重置，避免计时锁死 */
  强制暴怒() {
    if (this.暴怒剩余 > 0) {
      this.愤怒 = 配置.愤怒.最大值;
      this.暴怒剩余 = Math.min(配置.愤怒.暴怒持续秒, this.暴怒剩余 + 配置.愤怒.暴怒中延时秒);
      return;
    }
    this.愤怒 = 配置.愤怒.最大值;
    this.进入暴怒();
  }

  进入暴怒() {
    this.暴怒剩余 = 配置.愤怒.暴怒持续秒;
    发布("暴怒", { 进入: true });
  }

  检查称号() {
    const 称号 = 取称号(this.好感);
    if (称号 !== this.上次称号) {
      this.上次称号 = 称号;
      发布("称号变化", { 称号, 好感: this.好感 });
    }
  }

  get 称号() {
    return 取称号(this.好感);
  }

  get 好感比例() {
    const { 最小值, 最大值 } = 配置.好感度;
    return 夹取((this.好感 - 最小值) / (最大值 - 最小值), 0, 1);
  }

  get 愤怒比例() {
    return 夹取(this.愤怒 / 配置.愤怒.最大值, 0, 1);
  }

  get 暴怒中() {
    return this.暴怒剩余 > 0;
  }

  /** 每帧推进 */
  更新(步长) {
    this.在场秒 += 步长;

    if (this.暴怒剩余 > 0) {
      this.暴怒剩余 = Math.max(0, this.暴怒剩余 - 步长);
      if (this.暴怒剩余 === 0) {
        this.愤怒 = 配置.愤怒.暴怒后回落;
        发布("暴怒", { 进入: false });
      }
    } else if (this.愤怒 > 0) {
      this.愤怒 = Math.max(0, this.愤怒 - 配置.愤怒.自然衰减每秒 * 步长);
    }

    this.人气加成 = Math.max(0, this.人气加成 - 配置.人气.衰减每秒 * 步长);
    const 游走 = Math.sin(this.在场秒 * 0.55) * 配置.人气.游走幅度 * 0.45
      + Math.sin(this.在场秒 * 1.17 + 1.3) * 配置.人气.游走幅度 * 0.55;
    const 原始目标 = 配置.人气.基础 + 游走 + this.人气加成 + this.点赞数 * 0.08 + this.投掷数 * 0.15;
    const 目标 = Math.min(原始目标, 配置.人气.饱和上限);
    const t = 1 - Math.exp(-配置.人气.平滑 * 步长);
    this.人气显示 += (目标 - this.人气显示) * t;
  }

  记投掷(道具id) {
    this.投掷数++;
    this.人气加成 += 配置.人气.投掷加成;
    if (道具id === "西红柿") this.记西红柿();
  }

  记西红柿() {
    const 现在 = performance.now();
    const 窗口 = 配置.番茄雨.窗口秒 * 1000;
    this.番茄时间戳.push(现在);
    this.番茄时间戳 = this.番茄时间戳.filter((t) => 现在 - t <= 窗口);
    if (this.番茄时间戳.length < 配置.番茄雨.触发次数) return;
    const 冷却 = (配置.番茄雨.触发冷却秒 || 0) * 1000;
    if (this.番茄雨上次 >= 0 && 现在 - this.番茄雨上次 < 冷却) return;
    this.番茄雨上次 = 现在;
    发布("番茄雨");
  }

  记献礼() {
    this.献礼数++;
    this.人气加成 += 配置.人气.投掷加成 * 0.6;
  }

  记点赞(总数, 连击) {
    const 增量 = Math.max(0, 总数 - this.点赞数);
    this.点赞数 = 总数;
    this.连击 = 连击;
    if (连击 > this.最高连击) this.最高连击 = 连击;
    this.人气加成 += 增量 * 配置.人气.点赞加成;
  }

  /** YH-021根因治理：连击过期清全量（含状态连击快照） */
  清连击() {
    this.连击 = 0;
  }

  离开时存档() {
    this.存档写入();
  }
}
