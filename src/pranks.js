import { 配置, 取灯光预设列表, 随机取 } from "./config.js";
import { 随机, 随机整数 } from "./utils.js";
import { 发布, 订阅 } from "./events.js";

const 灯光列表 = 取灯光预设列表();

/**
 * 恶搞扩展包：蹦迪模式、弹幕口令彩蛋、主播の反击糊屏、幸运观众抽奖。
 * 全部是纯前端演出，不依赖任何后端。
 */
export class 恶搞系统 {
  constructor({ 舞台, 模型, 粒子, 特效, 弹幕, 界面 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.粒子 = 粒子;
    this.特效 = 特效;
    this.弹幕 = 弹幕;
    this.界面 = 界面;

    this.蹦迪剩余 = 0;
    this.蹦迪灯光计时 = 0;
    this.原灯光序号 = 0;

    this.抽奖计时 = 随机(配置.恶搞.抽奖间隔秒[0], 配置.恶搞.抽奖间隔秒[1]);
    this.抽奖剩余 = 0;
    this.反击计时器 = null;
    this.入围者 = new Set();
    this.本轮已提示入围 = false;

    this.绑定();
  }

  绑定() {
    订阅("本地弹幕", () => this.记入围());
    订阅("点赞", ({ 远程 }) => {
      if (!远程) this.记入围();
    });
    订阅("暴怒", ({ 进入 }) => {
      if (!进入) return;
      clearTimeout(this.反击计时器);
      this.反击计时器 = setTimeout(() => this.反击(), 配置.恶搞.反击延迟毫秒);
    });
    订阅("本地弹幕", ({ 内容 }) => this.试口令(内容));
    try {
      const 糊屏 = this.界面?.元素?.糊屏层;
      if (糊屏) 糊屏.dataset.反击次 = 糊屏.dataset.反击次 || "0";
    } catch {
    }
  }

  /* ── 蹦迪模式 ─────────────────────────── */

  切换蹦迪() {
    return this.蹦迪剩余 > 0 ? this.停蹦迪() : this.开蹦迪();
  }

  开蹦迪() {
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        发布("提示", { 文本: 配置.文案.蹦迪减弱 });
        return false;
      }
    } catch {
    }
    try {
      const 未成年 = localStorage.getItem(配置.未成年?.存储键 || "阳来_未成年_v1") === "1";
      if (未成年) {
        发布("提示", { 文本: 配置.未成年.蹦迪拦截 });
        return false;
      }
    } catch {
    }
    try {
      const 已读键 = 配置.频闪?.已读存储键;
      if (已读键 && !localStorage.getItem(已读键)) {
        localStorage.setItem(已读键, "1");
        发布("提示", { 文本: 配置.频闪.预警 });
      }
    } catch {
    }
    this.原灯光序号 = this.舞台.灯光序号;
    this.蹦迪剩余 = 配置.恶搞.蹦迪持续秒;
    this.蹦迪灯光计时 = 0;
    this.模型.蹦迪(配置.恶搞.蹦迪持续秒);
    this.界面.元素.蹦迪闪屏.classList.add("on");
    this.界面.设置旋转(true);
    发布("蹦迪", { 开启: true });
    发布("提示", { 文本: 配置.文案.蹦迪开 });
    发布("台词", { 文本: 随机取(配置.台词.蹦迪), 分类: "暴怒", 强制: true });
    return true;
  }

  停蹦迪() {
    this.蹦迪剩余 = 0;
    this.模型.停止蹦迪();
    this.界面.元素.蹦迪闪屏.classList.remove("on");
    this.舞台.应用灯光预设(this.原灯光序号);
    发布("蹦迪", { 开启: false });
    发布("提示", { 文本: 配置.文案.蹦迪关 });
    return false;
  }

  更新蹦迪(步长) {
    if (this.蹦迪剩余 <= 0) return;
    this.蹦迪剩余 -= 步长;
    if (this.蹦迪剩余 <= 0) {
      this.停蹦迪();
      return;
    }
    this.蹦迪灯光计时 -= 步长;
    if (this.蹦迪灯光计时 <= 0) {
      this.蹦迪灯光计时 = 配置.恶搞.蹦迪灯光间隔秒;
      this.舞台.应用灯光预设(随机整数(0, 灯光列表.length - 1));
      this.舞台.震一下(3);
    }
  }

  /* ── 弹幕口令彩蛋 ─────────────────────── */

  /** @returns {string|null} 命中的动作名 */
  试口令(文本) {
    const 内容 = String(文本 || "").toLowerCase();
    if (!内容) return null;
    const 候选 = [];
    for (const 条 of 配置.口令) {
      const 命中词 = 条.关键词.filter((词) => 内容.includes(词.toLowerCase()));
      if (命中词.length) {
        const 最长 = Math.max(...命中词.map((词) => 词.length));
        候选.push({ 条, 最长, 优先级: 条.优先级 ?? 0 });
      }
    }
    if (!候选.length) return null;
    候选.sort((a, b) => b.优先级 - a.优先级 || b.最长 - a.最长);
    const 命中 = 候选[0].条;
    this.执行口令(命中.动作);
    return 命中.动作;
  }

  执行口令(动作) {
    switch (动作) {
      case "太阳雨":
        this.特效.开始太阳雨();
        break;
      case "番茄雨":
        this.特效.开始番茄雨();
        break;
      case "蹦迪":
        if (this.蹦迪剩余 <= 0) this.开蹦迪();
        break;
      case "倒立":
        this.模型.倒立();
        发布("倒立");
        发布("提示", { 文本: 配置.文案.倒立 });
        this.舞台.震一下(8);
        break;
      case "清洗":
        发布("清洗");
        break;
      case "灯光": {
        const 预设 = this.舞台.切灯光();
        发布("提示", { 文本: 配置.文案.灯光.replace("{名}", 预设.名) });
        break;
      }
      case "暴怒":
        this.界面.状态.强制暴怒();
        break;
      case "升空":
        this.特效.升空();
        break;
      case "降温":
        this.界面.状态.加愤怒(-配置.愤怒.最大值);
        发布("提示", { 文本: 配置.文案.降压 });
        break;
      case "轰炸":
        this.界面.开始轰炸();
        break;
      case "火箭":
        this.特效.触发("火箭", {});
        break;
      case "喇叭":
        this.特效.触发("喇叭", {});
        break;
      case "关注":
        this.界面.切换关注?.();
        break;
      case "榜单":
        this.界面.切换榜单?.();
        break;
      default:
        break;
    }
  }

  /* ── 主播の反击 ─────────────────────── */

  反击() {
    发布("提示", { 文本: 配置.文案.反击 });
    this.舞台.震一下(20);
    const 层 = this.界面.元素.糊屏层;
    if (!层) return;
    层.dataset.反击次 = String(Number(层.dataset.反击次 || "0") + 1);
    层.dataset.反击时间 = String(Date.now());
    for (let i = 0; i < 配置.恶搞.反击溅点数; i++) {
      const 元素 = document.createElement("div");
      元素.className = "splat";
      const 直径 = 随机整数(配置.恶搞.反击溅点最小, 配置.恶搞.反击溅点最大);
      元素.style.width = `${直径}px`;
      元素.style.height = `${直径 * 随机(0.7, 1.25)}px`;
      元素.style.left = `${随机(2, 88)}%`;
      元素.style.top = `${随机(4, 84)}%`;
      元素.style.background = 随机取(配置.恶搞.反击溅色池);
      元素.style.setProperty("--rot", `${随机整数(0, 360)}deg`);
      元素.style.animationDelay = `${(i * 70) / 1000}s, ${1.5 + (i * 70) / 1000}s`;
      层.appendChild(元素);
      setTimeout(() => 元素.remove(), 2400 + i * 70);
    }
  }

  /* ── 幸运观众抽奖 ─────────────────────── */

  记入围() {
    try {
      const 名 = this.界面?.身份?.昵称 || "";
      if (!名) return;
      const 前 = this.入围者.size;
      this.入围者.add(名);
      if (this.入围者.size > 前 && !this.本轮已提示入围 && this.抽奖剩余 <= 0) {
        this.本轮已提示入围 = true;
        发布("提示", { 文本: 配置.运营.抽奖参与提示 });
      }
    } catch {
    }
  }

  抽一次() {
    const 我 = this.界面?.身份?.昵称 || "";
    const 候选 = [...this.入围者];
    let 名 = 随机取(配置.观众.昵称池);
    let 抽中自己 = false;
    if (候选.length >= (配置.运营.入围门槛 ?? 1) && Math.random() < 0.5) {
      名 = 候选[Math.floor(Math.random() * 候选.length)];
      if (我 && 名 === 我) 抽中自己 = true;
    } else if (我 && 候选.includes(我) && 名 === 我) {
      抽中自己 = true;
    }
    this.入围者.clear();
    this.本轮已提示入围 = false;
    const 奖品 = 随机取(配置.幸运观众奖品);
    const 横幅 = this.界面.元素.幸运观众;
    if (!横幅) return;
    this.界面.元素.幸运观众文本.replaceChildren();
    const 主 = document.createElement("div");
    主.textContent = `${配置.文案.抽奖标题}：${名}`;
    const 副 = document.createElement("small");
    const 模板 = String(配置.文案.抽奖副标 || "");
    const 标记 = "｛奖品｝";
    const 换后 = 模板.replace("{奖品}", 标记);
    const 切 = 换后.split(标记);
    副.replaceChildren();
    if (切.length === 2) {
      副.append(document.createTextNode(切[0]), document.createTextNode(奖品), document.createTextNode(切[1]));
    } else {
      副.textContent = 模板;
      const 奖 = document.createElement("b");
      奖.textContent = 奖品;
      副.append(document.createTextNode(" "), 奖);
    }
    this.界面.元素.幸运观众文本.append(主, 副);
    横幅.classList.add("on");
    横幅.classList.toggle("hit-me", 抽中自己);
    if (抽中自己) 发布("提示", { 文本: 配置.运营.抽中自己 });
    this.抽奖剩余 = 配置.恶搞.抽奖停留秒;
    发布("抽奖展示", { 昵称: 名, 抽中自己 });
    this.弹幕.发(`${名}：卧槽是我？！`);
  }

  更新抽奖(步长) {
    if (this.抽奖剩余 > 0) {
      this.抽奖剩余 -= 步长;
      if (this.抽奖剩余 <= 0) {
        this.界面.元素.幸运观众.classList.remove("on");
        this.界面.元素.幸运观众.classList.remove("hit-me");
      }
      return;
    }
    this.抽奖计时 -= 步长;
    if (this.抽奖计时 > 0) return;
    this.抽奖计时 = 随机(配置.恶搞.抽奖间隔秒[0], 配置.恶搞.抽奖间隔秒[1]);
    this.抽一次();
  }

  更新(步长) {
    this.更新蹦迪(步长);
    this.更新抽奖(步长);
  }

  get 在蹦迪() {
    return this.蹦迪剩余 > 0;
  }
}
