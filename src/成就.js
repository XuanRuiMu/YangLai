import { 配置 } from "./配置.js";
import { 发布, 订阅 } from "./事件.js";

/**
 * 成就系统：监听全局事件解锁成就，进度存 localStorage。
 * 置灰（未解锁）成就在帮助面板里以灰色剪影展示，留个念想。
 */
export class 成就系统 {
  constructor() {
    this.已解锁 = this.读档();
    this.表 = 配置.成就列表;
    this.交互数 = 0;
    this.解锁时间戳 = [];
    this.绑定();
  }

  读档() {
    try {
      const 原文 = localStorage.getItem(配置.成就.存储键);
      if (!原文) return this.内存档 ? new Set(this.内存档) : new Set();
      const 数据 = JSON.parse(原文);
      if (!数据 || 数据.版本 !== 配置.成就.版本 || !Array.isArray(数据.已解锁)) return this.内存档 ? new Set(this.内存档) : new Set();
      return new Set(数据.已解锁.filter((id) => typeof id === "string"));
    } catch {
      return this.内存档 ? new Set(this.内存档) : new Set();
    }
  }

  写档() {
    try {
      localStorage.setItem(
        配置.成就.存储键,
        JSON.stringify({ 版本: 配置.成就.版本, 已解锁: [...this.已解锁] })
      );
      this.内存档 = [...this.已解锁];
      this.存档仅内存 = false;
    } catch {
      this.内存档 = [...this.已解锁];
      this.存档仅内存 = true;
      发布("提示", { 文本: 配置.存档.本会话有效 });
    }
  }

  有(id) {
    return this.已解锁.has(id);
  }

  解锁(id) {
    if (this.已解锁.has(id)) return false;
    const 项 = this.表.find((x) => x.id === id);
    if (!项) return false;
    const 门槛 = 配置.成就 || {};
    if (typeof performance !== "undefined" && performance.now && (门槛.最小时长秒 || 0) > 0) {
      if ((performance.now() / 1000) < 门槛.最小时长秒) return false;
    }
    if (this.交互数 < (门槛.最小交互数 || 0)) return false;
    const 现在 = Date.now();
    const 窗口 = (门槛.频率窗口秒 || 60) * 1000;
    this.解锁时间戳 = this.解锁时间戳.filter((t) => 现在 - t <= 窗口);
    if (this.解锁时间戳.length >= (门槛.频率上限 || 20)) return false;
    this.解锁时间戳.push(现在);
    this.已解锁.add(id);
    this.写档();
    发布("成就解锁", { 成就: 项, 已解锁数: this.已解锁.size, 总数: this.表.length });
    return true;
  }

  记交互() {
    this.交互数++;
  }

  绑定() {
    订阅("点赞", ({ 远程 }) => {
      if (!远程) {
        this.记交互();
        this.解锁("首赞");
      }
    });
    订阅("连击", ({ 连击 }) => {
      if (连击 >= 10) this.解锁("手速");
    });
    订阅("道具命中", () => this.记交互());
    订阅("本地弹幕", () => this.记交互());
    订阅("番茄雨", () => this.解锁("番茄"));
    订阅("太羊雨", () => this.解锁("太羊"));
    订阅("污渍变化", ({ 数量 }) => {
      if (数量 >= 配置.恶搞.脏污阈值) this.解锁("脏");
    });
    订阅("清洗", () => this.解锁("清洗"));
    订阅("暴怒", ({ 进入 }) => {
      if (进入) this.解锁("暴怒");
    });
    订阅("蹦迪", ({ 开启 }) => {
      if (开启) this.解锁("蹦迪");
    });
    订阅("倒立", () => this.解锁("倒立"));
    订阅("取名", ({ 来源 }) => {
      if (来源 && 来源 !== "跳过") this.解锁("有名");
    });
    订阅("截图", () => this.解锁("摄影"));
    订阅("战报", () => this.解锁("海报"));
    订阅("远程弹幕", () => this.解锁("隔空"));
    订阅("香蕉滑倒", () => this.解锁("滑铲"));
    订阅("气跑", () => this.解锁("气跑"));
    订阅("标注", () => this.解锁("标注"));
    订阅("顶弹幕", ({ 最热 }) => {
      if (最热) this.解锁("顶");
    });
    订阅("巡游", ({ 开启 }) => {
      if (开启) this.解锁("巡游");
    });
    订阅("快捷键", () => this.解锁("快捷键"));
    订阅("轰炸", () => this.解锁("轰炸"));
    订阅("本地弹幕", () => {
      this.自发弹幕 = (this.自发弹幕 || 0) + 1;
      if (this.自发弹幕 >= 配置.恶搞.话痨阈值) this.解锁("话痨");
    });
    订阅("道具命中", ({ 道具 }) => {
      if (道具?.id === "蜘蛛") this.解锁("动物");
    });
    订阅("称号变化", ({ 称号 }) => {
      if (称号 === "铁哥们") this.解锁("铁哥们");
      if (称号 === "不共戴天") this.解锁("不共戴天");
    });
    // 新增成就
    订阅("道具命中", ({ 道具 }) => {
      if (道具?.id === "火箭") this.解锁("火箭");
      if (道具?.id === "窜天火箭") this.解锁("火箭");
    });
    订阅("喇叭", () => this.解锁("喇叭"));
    订阅("关注", () => this.解锁("关注"));
    订阅("上榜", () => this.解锁("上榜"));
    订阅("台词", ({ 分类 }) => {
      if (分类 === "开麦") this.解锁("开麦");
    });
    订阅("表情", () => this.解锁("表情"));
    订阅("标注", ({ 部位 }) => {
      // 收集已点部位，集齐头/上半身/下半身触发指点成就
      this._标注部位 = this._标注部位 || new Set();
      this._标注部位.add(部位);
      if (this._标注部位.has("头") && this._标注部位.has("上半身") && this._标注部位.has("下半身")) {
        this.解锁("指点");
      }
    });
  }

  /** 在场时长成就靠每帧轮询，省得再开一个定时器 */
  更新(在场秒) {
    if (在场秒 >= 配置.恶搞.长情阈值秒) this.解锁("长情");
  }

  get 总数() {
    return this.表.length;
  }

  get 已解锁数() {
    return this.已解锁.size;
  }
}
