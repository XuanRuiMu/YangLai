import { 配置, 随机取 } from "./config.js";
import { 净化文本, 过滤敏感词, 洗牌, 随机, 随机整数 } from "./utils.js";
import { 发布, 订阅 } from "./events.js";
import { 治理 } from "./运营.js";

/** YH-017根因治理：道具改名后旧id别名，保证反应弹幕/成就引用不断 */
const 反应别名 = { 窜天火箭: "升空反应" };

function 造观众名() {
  const 底 = 随机取(配置.观众.昵称池);
  if (Math.random() < 配置.观众.加后缀概率) {
    return `${底}${随机取(配置.观众.后缀池)}${随机整数(2, 99)}`;
  }
  return 底;
}

/** 喇叭刷屏：短时间内连发多条弹幕 */
function 喇叭刷屏(实例) {
  const 条数 = 配置.特效.喇叭弹幕条数;
  const 间隔 = 配置.特效.喇叭弹幕间隔毫秒;
  const 池 = 配置.反应弹幕.喇叭 || ["喇叭一响，全屏都是梗", "这主播耳朵还好吗", "刷屏开始了，快截图"];
  for (let i = 0; i < 条数; i++) {
    setTimeout(() => {
      if (!实例.开启) return;
      实例.发(`${造观众名()}：${随机取(池)}`, false, { 反应: "喇叭" });
    }, i * 间隔);
  }
}

/** 直播间弹幕：NPC 气氛组 + 反应式弹幕 + 用户发送 */
export class 弹幕系统 {
  constructor(层) {
    this.层 = 层;
    this.同屏 = 0;
    this.上次自动 = 0;
    this.上次发送 = 0;
    this.池 = 洗牌(配置.弹幕池);
    this.池索引 = 0;
    this.开启 = true;
    this.昵称 = "";
    this.本帧已发 = 0;
    this.池DOM = [];
    this.语音开 = null;
    this.声音开 = null;
    this.绑定反应();
  }

  设开关(取语音开, 取声音开) {
    this.语音开 = 取语音开;
    this.声音开 = 取声音开;
  }

  绑定反应() {
    订阅("道具命中", ({ 道具 }) => {
      const 键 = 反应别名[道具?.id] || 道具?.id;
      if (配置.反应弹幕[键]) this.安排反应(键);
      else if (道具?.分类 === "投掷") this.安排反应("投掷");
      else if (道具?.分类 === "投送") this.安排反应("献花");
    });
    订阅("点赞", ({ 连击 }) => {
      if (连击 >= 3) this.安排反应("连击");
    });
    订阅("暴怒", ({ 进入 }) => {
      if (进入) this.安排反应("暴怒");
    });
    订阅("清洗", () => this.安排反应("清洗"));
    订阅("番茄雨", () => this.安排反应("番茄雨"));
    订阅("太阳雨", () => this.安排反应("太阳"));
    订阅("蹦迪", ({ 开启 }) => {
      if (开启) this.安排反应("蹦迪");
    });
    订阅("喇叭", () => 喇叭刷屏(this));
    订阅("礼物", ({ 道具 }) => {
      const 键 = 反应别名[道具?.id] || 道具?.id;
      if (配置.反应弹幕[键]) this.安排反应(键);
    });
    订阅("远程弹幕", ({ 文本, 昵称 }) => {
      if (文本) {
        if (昵称 && 治理.在名单(昵称)) return;
        this.发(文本, false, { 远程: true });
      }
    });
  }

  安排反应(键) {
    const 池 = 配置.反应弹幕[键];
    if (!池?.length) return;
    // 根因：全道具轮投时 26 发命中在 6 秒内灌入，26 个 setTimeout 各自延迟 0.3~2s 后同时开火，
    // 26 条反应弹幕 + 自动弹幕 + 台词气泡挤在同一屏，左上 stat 面板区叠成一团。
    // 删“每发必排一条”的冗余：同一反应键合并为 1 条，同屏已有同键反应时不再排队。
    const 同键已有 = [...this.层.children].some((n) => n.dataset.react === 键);
    if (同键已有) return;
    if (this.待反应?.has(键)) return;
    (this.待反应 ??= new Set()).add(键);
    const [最小, 最大] = 配置.弹幕.反应延迟毫秒;
    const 延迟 = 最小 + Math.random() * (最大 - 最小);
    setTimeout(() => {
      try {
        this.待反应?.delete(键);
      } catch {}
      if (!this.开启) return;
      this.发(`${造观众名()}：${随机取(池)}`, false, { 反应: 键 });
    }, 延迟);
  }

  更新(步长) {
    this.本帧已发 = 0;
    if (!this.开启) return;
    this.上次自动 += 步长 * 1000;
    if (this.上次自动 < 配置.弹幕.自动间隔毫秒) return;
    this.上次自动 = 0;

    if (Math.random() > 配置.弹幕.触发概率) return;
    if (this.同屏 >= 配置.弹幕.同屏上限) return;

    if (this.池索引 >= this.池.length) {
      this.池 = 洗牌(配置.弹幕池);
      this.池索引 = 0;
    }
    this.发(`${造观众名()}：${this.池[this.池索引++]}`);
  }

  /** 发送一条弹幕（会做长度与频率限制） */
  发送(文本, 自己的 = false) {
    let 内容 = 净化文本(文本, 配置.安全.弹幕最大长度);
    if (!内容) return false;
    if (自己的) {
      const 过滤 = 过滤敏感词(内容, 配置.安全.敏感词表, 配置.安全.敏感词替换符);
      if (过滤.命中) {
        内容 = 过滤.文本;
        发布("提示", { 文本: 配置.安全.敏感词提示 });
      }
    }

    if (自己的) {
      const 现在 = performance.now();
      if (现在 - this.上次发送 < 配置.安全.弹幕最小间隔毫秒) {
        发布("提示", { 文本: 配置.文案.弹幕太快 });
        return false;
      }
      this.上次发送 = 现在;
    }    const 行 = 自己的 && this.昵称 ? `${this.昵称}：${内容}` : 内容;
    const 成功 = this.发(行, 自己的);
    if (成功 && 自己的) 发布("本地弹幕", { 文本: 行, 内容, 昵称: this.昵称 });
    return 成功;
  }

  /**
   * 落一条弹幕到屏幕上
   * @param {object} [标记] { 反应: 触发它的事件键, 远程: 来自别的标签页 }
   */
  发(内容, 自己的 = false, 标记 = {}) {
    if (this.同屏 >= 配置.弹幕.同屏上限 + 4) {
      if (!自己的) return false;
      // 满屏时自己的弹幕挤掉最旧的一条——用户消息不能无声消失
      const 最旧 = this.层.firstElementChild;
      if (!最旧) return false;
      最旧.dispatchEvent(new Event("animationend"));
      if (最旧.isConnected) {
        最旧.remove();
        this.同屏 = Math.max(0, this.同屏 - 1);
      }
    }
    if (!自己的 && this.本帧已发 >= 配置.安全.每帧最多生成弹幕) return false;
    // 外来弹幕可能带昵称前缀，上限放宽一点再净化；拉黑名单本地过滤
    const 文本 = 净化文本(内容, 配置.安全.弹幕最大长度 + 配置.身份.最大长度 + 4);
    if (!文本) return false;
    if (!自己的) {
      const 前缀 = 文本.split("：")[0].split(":")[0];
      if (前缀 && 治理.在名单(前缀)) return false;
    }
    this.本帧已发++;

    // 高能弹幕走独立置顶轨道：历史根因是高能与普通弹幕抢同一随机高度带，
    // 普通弹幕随机 top 落到 62% 附近时会与中央 toast 区重叠，被误判为叠字。
    // 置顶轨道固定 6%，不参与随机高度抽签。
    const 置顶 = !!标记.高能;
    const 元素 = this.池DOM.length > 0 ? this.取复用元素() : document.createElement("div");
    元素.className = "danmu" + (自己的 ? " mine" : "") + (置顶 ? " hot" : "");
    元素.textContent = 文本;
    if (标记.反应) 元素.dataset.react = 标记.反应;
    if (标记.远程) 元素.dataset.remote = "1";
    元素.style.top = 置顶 ? "6%" : `${随机(4, 配置.弹幕.随机高度上限 ?? 62)}%`;
    元素.style.fontSize = `${随机(15, 21).toFixed(0)}px`;

    const 时长 = 配置.弹幕.停留秒 * 随机(0.85, 1.25);
    元素.style.animationDuration = `${时长}s`;

    if (配置.弹幕.可点赞) {
      元素.style.pointerEvents = "auto";
      元素.绑定的顶处理器 && 元素.removeEventListener("click", 元素.绑定的顶处理器);
      const 处理器 = () => this.顶一条(元素);
      元素.绑定的顶处理器 = 处理器;
      元素.addEventListener("click", 处理器);
    }

    this.层.appendChild(元素);
    this.同屏++;

    let 已清理 = false;
    const 清理 = () => {
      if (已清理) return;
      已清理 = true;
      元素.textContent = '';
      元素.className = '';
      元素.style.cssText = '';
      for (const 键 of Object.keys(元素.dataset)) delete 元素.dataset[键];
      const 标 = 元素.querySelector(".danmu-hot");
      标 && 标.remove();
      if (this.池DOM.length < 20) this.池DOM.push(元素);
      this.同屏 = Math.max(0, this.同屏 - 1);
    };
    元素.addEventListener("animationend", 清理, { once: true });
    setTimeout(清理, 时长 * 1000 + 1500);
    return true;
  }

  /** YH-015根因治理：池复用解绑旧残留（处理器/b元素/dataset） */
  取复用元素() {
    const 元素 = this.池DOM.pop();
    元素.绑定的顶处理器 && 元素.removeEventListener("click", 元素.绑定的顶处理器);
    元素.绑定的顶处理器 = null;
    元素.textContent = '';
    元素.className = '';
    元素.style.cssText = '';
    for (const 键 of Object.keys(元素.dataset)) delete 元素.dataset[键];
    const 残留顶 = 元素.querySelector(".danmu-hot");
    残留顶 && 残留顶.remove();
    return 元素;
  }

  /** 点一条弹幕给它「顶」，顶够次数变成金色 */
  顶一条(元素) {
    const 数 = Number(元素.dataset.顶 || "0") + 1;
    元素.dataset.顶 = String(数);

    let 标 = 元素.querySelector(".danmu-hot");
    if (!标) {
      标 = document.createElement("b");
      标.className = "danmu-hot";
      元素.appendChild(标);
    }
    标.textContent = ` ×${数}`;

    const 最热 = 数 >= 配置.弹幕.点赞最热阈值;
    if (最热 && !元素.classList.contains("hot")) {
      元素.classList.add("hot");
      发布("提示", { 文本: 配置.文案.顶弹幕 });
    }
    发布("顶弹幕", { 数, 最热 });
  }

  清空() {
    this.层.replaceChildren();
    this.同屏 = 0;
    this.池DOM.length = 0;
  }

  /** 高能弹幕：带语音播报 */
  发送高能(文本) {
    let 内容 = 净化文本(文本, 配置.安全.弹幕最大长度);
    if (!内容) return false;
    const 过滤 = 过滤敏感词(内容, 配置.安全.敏感词表, 配置.安全.敏感词替换符);
    if (过滤.命中) {
      内容 = 过滤.文本;
      发布("提示", { 文本: 配置.安全.敏感词提示 });
    }
    const 现在 = performance.now();
    if (现在 - this.上次发送 < 配置.安全.弹幕最小间隔毫秒) {
      发布("提示", { 文本: 配置.文案.弹幕太快 });
      return false;
    }
    if (现在 - (this.上次高能 || 0) < (配置.安全.高能最小间隔毫秒 || 0)) {
      发布("提示", { 文本: 配置.文案.弹幕太快 });
      return false;
    }
    this.上次发送 = 现在;
    this.上次高能 = 现在;
    const 昵称 = this.昵称 || "匿名用户";
    this.发(`${昵称}：⚡ ${内容}`, true, { 高能: true });
    this.播报高能(昵称, 内容);
    return true;
  }

  /** 用 Edge TTS 云扬声线播报高能弹幕 */
  播报高能(昵称, 内容) {
    if (!this.语音开?.()) return;
    if (!this.声音开?.()) return;
    const 合成 = window.speechSynthesis;
    if (!合成 || typeof window.SpeechSynthesisUtterance !== "function") return;
    合成.cancel();
    const 朗读文本 = `用户${昵称}发送高能弹幕说\u3000\u3000${内容}`;
    const 句 = new SpeechSynthesisUtterance(朗读文本);
    句.lang = "zh-CN";
    句.rate = 1.0;
    句.pitch = 1.0;
    句.volume = 1.0;
    const 列表 = 合成.getVoices?.() || [];
    const 云扬 = 列表.find((v) => /Yunyang/i.test(v.name)) || 列表.find((v) => /zh|cmn|Chinese/i.test(`${v.lang} ${v.name}`));
    if (云扬) 句.voice = 云扬;
    合成.speak(句);
  }
}
