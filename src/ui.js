import * as THREE from "three";
import { 配置, 随机取 } from "./config.js";
import { 净化文本, 格式化时长, 格式化数字, 世界转客户端, 文件名安全, 屏幕转归一化 } from "./utils.js";
import { 声音 } from "./audio.js";
import { 语音 } from "./speech.js";
import { 同步开关语义 } from "./a11y.js";
import { 生成战报 } from "./poster.js";
import { 读身份, 写身份 } from "./identity.js";
import { 吐槽标注 } from "./pins.js";
import { 发布, 订阅 } from "./events.js";
import { 气氛系统 } from "./hype.js";
import { 埋点 } from "./埋点.js";
import { 治理 } from "./运营.js";
import { 错误收集, 当前未成年, 切换未成年, 当前主题, 切换主题, 当前省电, 切换省电, 当前语言, 切换语言, 反馈保存, 监视离线 } from "./治理.js";
import { 文案, 取文案 } from "./i18n/zh-CN.js";

const 取 = (选择器) => document.querySelector(选择器);

/* 面板置顶：点谁谁在最上面。
 * 栈内按置顶顺序赋 z-index（31 起），五个面板最多用到 35，
 * 永远压不过遮罩层（.mask 的 50），狂点也不会盖住弹窗。 */
const 面板栈 = [];
const 置顶面板 = (元素) => {
  if (!元素) return;
  const 已有 = 面板栈.indexOf(元素);
  if (已有 !== -1) 面板栈.splice(已有, 1);
  面板栈.push(元素);
  面板栈.forEach((面板, 序号) => {
    面板.style.zIndex = String(31 + 序号);
  });
};

export class 界面 {
  constructor({ 舞台, 模型, 状态, 点赞, 道具, 弹幕, 特效, 成就 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.状态 = 状态;
    this.点赞 = 点赞;
    this.道具 = 道具;
    this.弹幕 = 弹幕;
    this.特效 = 特效;
    this.成就 = 成就;

    this.元素 = {
      画布: 取("#stage"),
      顶栏: 取("#topbar"),
      在线: 取("#online-count"),
      人气: 取("#popularity"),
      人气区: 取("#popularity-wrap"),
      标签数: 取("#tab-count"),
      标签区: 取("#tab-count-wrap"),
      昵称钮: 取("#nick-btn"),
      关注钮: 取("#follow-btn"),
      蜜蜂标: 取("#brand-bee"),
      停留: 取("#stay-time"),
      称号: 取("#title-badge"),
      好感值: 取("#favor-value"),
      好感条: 取("#favor-bar"),
      愤怒值: 取("#anger-value"),
      愤怒条: 取("#anger-bar"),
      点赞数: 取("#like-count"),
      连击数: 取("#combo-count"),
      投掷数: 取("#throw-count"),
      成就数: 取("#medal-count"),
      成就数帮助: 取("#medal-count-help"),
      成就墙: 取("#medal-list"),
      成就行: 取(".stat-medals"),
      控制栏: 取("#controls"),
      状态面板: 取("#stat-panel"),
      道具页签: 取("#prop-tabs"),
      道具列表: 取("#prop-list"),
      弹幕层: 取("#danmu-layer"),
      漂浮层: 取("#float-layer"),
      气泡: 取("#speech-bubble"),
      提示层: 取("#toast-layer"),
      连击弹: 取("#combo-pop"),
      暴怒闪屏: 取("#rage-flash"),
      蹦迪闪屏: 取("#disco-flash"),
      糊屏层: 取("#splat-layer"),
      幸运观众: 取("#lottery"),
      幸运观众文本: 取("#lottery-text"),
      帮助遮罩: 取("#help-mask"),
      帮助关闭: 取("#help-close"),
      弹幕输入: 取("#danmu-input"),
      弹幕发送: 取("#danmu-send"),
      弹幕高能: 取("#danmu-send-hot"),
      表情栏: 取("#danmu-emoji-bar"),
      取名遮罩: 取("#nick-mask"),
      取名标题: 取("#nick-title"),
      取名提示: 取("#nick-tip"),
      取名输入: 取("#nick-input"),
      取名确认: 取("#nick-ok"),
      取名跳过: 取("#nick-skip"),
      取名错误: 取("#nick-error"),
      加载遮罩: 取("#loading"),
      加载条: 取("#loading-bar"),
      加载文字: 取("#loading-text"),
      公告条: 取("#marquee"),
      公告条文本: 取("#marquee-text"),
      标注层: 取("#pin-layer"),
      进场层: 取("#entry-layer"),
      礼物层: 取("#gift-layer"),
      榜单: 取("#gift-rank"),
      榜单标题: 取("#gift-rank-title"),
      道具栏: 取("#dock"),
      弹幕栏: 取("#danmu-input-bar"),
      动作面板: 取("#action-panel"),
      动作列表: 取("#action-list"),
      动作关闭: 取("#action-close"),
    };

    this.当前分类 = 配置.道具分类[0].id;
    this.拖拽 = null;
    this.台词计时 = 0;
    this.台词冷却 = 0;
    this.气泡剩余 = 0;
    this.在线基数 = 配置.直播间.观看基数;
    this.蜜蜂连点 = [];
    this.上次人气 = null;
    this.上次旋转态 = null;
    this.巡游中 = false;
    this.巡游计时 = 0;
    this.巡游序号 = 0;
    this.原自动旋转 = 配置.模型.自动旋转;
    this.公告计时 = 0;
    this.公告序号 = 0;
    this.身份 = 读身份();
    this.弹幕.昵称 = this.身份.昵称;
    this.标注 = new 吐槽标注({ 舞台: this.舞台, 模型: this.模型, 层: this.元素.标注层 });

    this.建道具栏();
    this.建动作栏();
    this.绑定控制栏();
    this.绑定快捷键();
    this.绑定关注钮();
    this.绑定快捷表情();
    this.绑定弹幕输入();
    this.绑定帮助();
    this.绑定取名();
    this.绑定蜜蜂();
    this.绑定成就行();
    this.订阅事件();
    this.刷新人气开关();
    this.刷新昵称钮();
    this.启动公告条();
    if (this.元素.在线 && !this.元素.在线.title) this.元素.在线.title = 配置.合规?.在线口径 || "";
    this.刷新成就墙();
    this.同步按钮初始态();
    this.同步帮助文案();
    this.绑定新手引导();
    this.绑定存档区();
    this.建治理栏();
    this.绑定未成年提醒();
    this.初始化气氛系统();
    this.使可拖动(this.元素.状态面板);
    this.使可拖动(this.元素.控制栏);
    this.使可拖动(this.元素.道具栏);
    this.使可拖动(this.元素.弹幕栏);
    this.使可拖动(this.元素.动作面板);
  }

  /** 把「关着」的功能按钮先标成灰色，别让人以为开着 */
  同步按钮初始态() {
    const 语音钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="voice"]');
    if (语音钮) {
      语音钮.classList.toggle("off", !语音.开启);
      同步开关语义("voice", 语音.开启);
    }
    const 旋转钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="spin"]');
    if (旋转钮) 同步开关语义("spin", 配置.模型.自动旋转);
    同步开关语义("sound", 声音.开启);
    同步开关语义("disco", false);
  }

  /**
   * 面板拖动。
   * 关键点：偏移只写 --拖X / --拖Y 两个 CSS 变量，绝不碰 left/top/transform。
   * 底部两个面板靠 left:50% + translateX(-50%) 居中，一旦把 left 改成像素值，
   * 居中基准就丢了，面板会瞬间横移半个身位——这就是「菜单跑掉」的根因。
   */
  使可拖动(元素) {
    if (!元素 || 元素.dataset.可拖动 === "1") return;
    元素.dataset.可拖动 = "1";
    元素.classList.add("可拖动");

    const 标识 = 元素.id || Math.random().toString(36).slice(2, 8);
    const 键名 = `${配置.面板?.偏移键前缀 || "蜂来_面板偏移_v2_"}${标识}`;
    const 旧键名 = `${配置.面板?.旧偏移键前缀 || "蜂来_面板偏移_"}${标识}`;
    try {
      localStorage.removeItem(`蜂来_面板位置_${标识}`);
      const 旧存 = localStorage.getItem(旧键名);
      if (旧存 && !localStorage.getItem(键名)) {
        try {
          const 旧偏 = JSON.parse(旧存);
          if (旧偏 && Number.isFinite(旧偏.x) && Number.isFinite(旧偏.y)) localStorage.setItem(键名, JSON.stringify(旧偏));
        } catch {}
        localStorage.removeItem(旧键名);
      }
    } catch {}

    const 读偏移 = () => {
      const x = parseFloat(元素.style.getPropertyValue("--拖X"));
      const y = parseFloat(元素.style.getPropertyValue("--拖Y"));
      return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
    };
    const 写偏移 = (x, y) => {
      元素.style.setProperty("--拖X", `${Math.round(x)}px`);
      元素.style.setProperty("--拖Y", `${Math.round(y)}px`);
    };
    const 夹 = (值, 小, 大) => (小 > 大 ? (小 + 大) / 2 : Math.max(小, Math.min(大, 值)));
    /** 至少给面板留出一角在屏幕内，拖不丢也找得回来 */
    const 限制 = (x, y) => {
      const 偏 = 读偏移();
      const 矩形 = 元素.getBoundingClientRect();
      if (!矩形.width && !矩形.height) return { x, y };
      const 基左 = 矩形.left - 偏.x;
      const 基上 = 矩形.top - 偏.y;
      const 留宽 = Math.min(矩形.width, 160);
      const 留高 = Math.min(矩形.height, 72);
      return {
        x: 夹(x, 留宽 - 矩形.width - 基左, window.innerWidth - 留宽 - 基左),
        y: 夹(y, 留高 - 矩形.height - 基上, window.innerHeight - 留高 - 基上),
      };
    };
    const 归拢 = () => {
      const 偏 = 读偏移();
      const 限 = 限制(偏.x, 偏.y);
      写偏移(限.x, 限.y);
      return 限;
    };
    const 保存 = () => {
      try { localStorage.setItem(键名, JSON.stringify(读偏移())); } catch {}
    };
    const 复位 = () => {
      元素.classList.add("归位中");
      写偏移(0, 0);
      try { localStorage.removeItem(键名); } catch {}
      window.setTimeout(() => 元素.classList.remove("归位中"), 420);
    };

    let 有存档 = false;
    try {
      const 存 = JSON.parse(localStorage.getItem(键名) || "null");
      if (存 && Number.isFinite(存.x) && Number.isFinite(存.y)) {
        写偏移(存.x, 存.y);
        有存档 = true;
      }
    } catch {}

    let 指针号 = null;
    let 起点X = 0;
    let 起点Y = 0;
    let 起始偏 = { x: 0, y: 0 };
    let 已动 = false;
    let 帧号 = 0;
    let 目标 = { x: 0, y: 0 };
    let 上次点击 = 0;

    const 应用 = () => {
      帧号 = 0;
      const 限 = 限制(目标.x, 目标.y);
      写偏移(限.x, 限.y);
    };

    const 抬起 = (e) => {
      if (指针号 === null) return;
      if (e && e.pointerId !== 指针号) return;
      if (帧号) { cancelAnimationFrame(帧号); 应用(); }
      try { 元素.releasePointerCapture(指针号); } catch {}
      window.removeEventListener("pointermove", 移动);
      window.removeEventListener("pointerup", 抬起);
      window.removeEventListener("pointercancel", 抬起);
      指针号 = null;
      元素.classList.remove("dragging");
      if (已动) { 保存(); 已动 = false; }
    };

    const 移动 = (e) => {
      if (指针号 === null || e.pointerId !== 指针号) return;
      const 差X = e.clientX - 起点X;
      const 差Y = e.clientY - 起点Y;
      if (!已动) {
        if (Math.abs(差X) < 4 && Math.abs(差Y) < 4) return;
        已动 = true;
        元素.classList.add("dragging");
      }
      if (e.cancelable) e.preventDefault();
      目标 = { x: 起始偏.x + 差X, y: 起始偏.y + 差Y };
      if (!帧号) 帧号 = requestAnimationFrame(应用);
    };

    const 按下 = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("button, input, textarea, select, a, .ctrl, .prop, .prop-tab, .emoji-btn, .act-chip")) return;
      置顶面板(元素);
      if (e.pointerType !== "mouse" && e.cancelable) e.preventDefault();
      const 现在 = performance.now();
      // 手机上双击普遍比桌面慢，窗口放宽到 350ms，不然「连点两下归位」很难触发
      if (现在 - 上次点击 < 350) {
        上次点击 = 0;
        指针号 = null;
        复位();
        return;
      }
      上次点击 = 现在;
      指针号 = e.pointerId;
      起点X = e.clientX;
      起点Y = e.clientY;
      起始偏 = 读偏移();
      已动 = false;
      try { 元素.setPointerCapture(e.pointerId); } catch {}
      // 监听必须挂 window：部分安卓 WebView 触屏会拒绝 pointer capture，
      // 挂在元素上手指出边界事件流就断，表现为「拖不动 / 拖一下就停」
      window.addEventListener("pointermove", 移动);
      window.addEventListener("pointerup", 抬起);
      window.addEventListener("pointercancel", 抬起);
    };

    元素.addEventListener("pointerdown", 按下);
    window.addEventListener("resize", 归拢);
    window.addEventListener("orientationchange", 归拢);
    if (有存档) requestAnimationFrame(归拢);
  }

  /* ── 道具栏 ─────────────────────────── */

  建道具栏() {
    const { 道具页签, 道具列表 } = this.元素;

    道具页签.replaceChildren();
    for (const 分类 of 配置.道具分类) {
      const 按钮 = document.createElement("button");
      按钮.className = "prop-tab" + (分类.id === this.当前分类 ? " active" : "");
      按钮.textContent = 分类.名;
      按钮.type = "button";
      按钮.addEventListener("click", () => this.切换分类(分类.id));
      道具页签.appendChild(按钮);
    }

    道具列表.replaceChildren();
    for (const 道具 of 配置.道具) {
      if (道具.分类 !== this.当前分类) continue;
      const 项 = document.createElement("div");
      项.className = "prop";
      项.dataset.prop = 道具.id;
      项.title = `${道具.id} · ${道具.说明}`;

      const 图标 = document.createElement("div");
      图标.className = "prop-icon";
      图标.textContent = 道具.emoji;

      const 名字 = document.createElement("div");
      名字.className = "prop-name";
      名字.textContent = 道具.id;

      const 角标 = document.createElement("div");
      角标.className = "prop-badge";
      角标.textContent = 道具.好感 >= 0 ? `+${道具.好感}` : `${道具.好感}`;

      项.append(图标, 名字, 角标);
      项.addEventListener("pointerdown", (事件) => this.开始拖拽(事件, 道具, 项));
      道具列表.appendChild(项);
    }
  }

  切换分类(分类) {
    if (this.当前分类 === 分类) return;
    this.当前分类 = 分类;
    声音.播放("界面");
    this.建道具栏();
  }

  /* ── 动作栏 ─────────────────────────── */

  建动作栏() {
    const { 动作列表, 动作面板, 动作关闭 } = this.元素;
    if (!动作列表) return;

    // 待机（回到着色模型）置顶
    const 项列表 = [
      { id: "待机", 名: "待机", 图标: "🧍" },
      ...配置.动作.列表.filter((a) => a.id !== "待机"),
      { id: 配置.动作.分离.id, 名: 配置.动作.分离.名, 图标: 配置.动作.分离.图标 },
    ];

    动作列表.replaceChildren();
    for (const 项 of 项列表) {
      const 按钮 = document.createElement("button");
      按钮.type = "button";
      按钮.className = "act-chip" + (项.id === "待机" ? " home" : "");
      按钮.dataset.act = 项.id;
      按钮.title = 项.名;
      const 图标 = document.createElement("span");
      图标.className = "act-ico";
      图标.textContent = 项.图标;
      const 名 = document.createElement("span");
      名.className = "act-name";
      名.textContent = 项.名;
      按钮.append(图标, 名);
      按钮.addEventListener("click", () => this.播放动作(项.id, 按钮));
      动作列表.appendChild(按钮);
    }

    // 关闭面板 → 回到待机
    动作关闭?.addEventListener("click", () => {
      声音.解锁();
      声音.播放("界面");
      this.模型.停止动作();
      this.动作面板高亮(null);
      this.切换动作面板(false);
    });
  }

  播放动作(名, 按钮) {
    if (!this.模型.动作系统?.就绪) {
      this.模型.确保部件?.();
      发布("提示", { 文本: 配置.文案.动作加载中 });
      return;
    }
    声音.解锁();
    声音.播放("界面");
    this.模型.播放动作(名);
    this.动作面板高亮(名);
    if (名 !== "待机") this.切换动作面板(true);
  }

  动作面板高亮(名) {
    const { 动作列表 } = this.元素;
    if (!动作列表) return;
    动作列表.querySelectorAll(".act-chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.act === 名);
    });
  }

    切换动作面板(显示) {
    const { 动作面板 } = this.元素;
    if (!动作面板) return;
    const 之前隐藏 = 动作面板.classList.contains("hidden");
    if (显示 === undefined) 显示 = 之前隐藏;    动作面板.classList.toggle("hidden", !显示);
    if (显示 && 之前隐藏) {
      try {
        this.打开前焦点 = document.activeElement;
      } catch {
      }
      置顶面板(动作面板);
      try {
        动作面板.querySelector(".act-chip")?.focus();
      } catch {
      }
    }
    const 钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="actions"]');
    钮?.classList.toggle("active", 显示);
  }

  开始拖拽(事件, 道具, 元素) {
    事件.preventDefault();
    声音.解锁();
    this.取消拖拽();

    const 幽灵 = document.createElement("div");
    幽灵.className = "prop-ghost";
    幽灵.textContent = 道具.emoji;
    幽灵.style.left = `${事件.clientX}px`;
    幽灵.style.top = `${事件.clientY}px`;
    document.body.appendChild(幽灵);

    元素.classList.add("lifted");
    this.舞台.暂停自动旋转(6);
    this.舞台.画布.classList.add("aiming");

    this.拖拽 = {
      道具,
      元素,
      幽灵,
      起点: { x: 事件.clientX, y: 事件.clientY },
      移动过: false,
      指针编号: 事件.pointerId,
    };
    this.拖拽移 = (e) => this.移动拖拽(e);
    this.拖拽放 = (e) => this.结束拖拽(e);
    this.拖拽消 = () => this.取消拖拽();
    window.addEventListener("pointermove", this.拖拽移);
    window.addEventListener("pointerup", this.拖拽放);
    window.addEventListener("pointercancel", this.拖拽消);
    try {
      元素.setPointerCapture(事件.pointerId);
    } catch {
      /* 某些浏览器在触屏上不支持捕获，忽略即可 */
    }
  }

  移动拖拽(事件) {
    const 拖拽 = this.拖拽;
    if (!拖拽 || 事件.pointerId !== 拖拽.指针编号) return;

    拖拽.幽灵.style.left = `${事件.clientX}px`;
    拖拽.幽灵.style.top = `${事件.clientY}px`;

    if (Math.hypot(事件.clientX - 拖拽.起点.x, 事件.clientY - 拖拽.起点.y) > 配置.手势.投掷位移像素) 拖拽.移动过 = true;

    const 命中 = this.射线命中(事件.clientX, 事件.clientY);
    this.道具.显示瞄准(命中);
    拖拽.命中 = 命中;
    拖拽.幽灵.classList.toggle("over", !!命中);
  }

  结束拖拽(事件) {
    const 拖拽 = this.拖拽;
    if (!拖拽 || 事件.pointerId !== 拖拽.指针编号) return;

    const 直中 = this.射线命中(事件.clientX, 事件.clientY);
    this.清理拖拽();

    const 坐标 = 屏幕转归一化(事件.clientX, 事件.clientY, this.舞台.画布);
    const 结果 = this.投出(拖拽.道具, 坐标);
    if (!结果.成功) {
      发布("提示", { 文本: 配置.文案.飞行超限 });
      return;
    }
    if (!直中 && !结果.是否兜底) 发布("提示", { 文本: 配置.文案.飞出界.replace("{emoji}", 拖拽.道具.emoji) });
    else if (!直中 && 结果.是否兜底) this.道具.隐藏瞄准();
  }

  取消拖拽() {
    if (!this.拖拽) return;
    this.清理拖拽();
    this.道具.隐藏瞄准();
  }

  清理拖拽() {
    const 拖拽 = this.拖拽;
    this.道具.隐藏瞄准();
    this.舞台.画布.classList.remove("aiming");
    if (!拖拽) return;
    window.removeEventListener("pointermove", this.拖拽移);
    window.removeEventListener("pointerup", this.拖拽放);
    window.removeEventListener("pointercancel", this.拖拽消);
    拖拽.幽灵.remove();
    拖拽.元素.classList.remove("lifted");
    try {
      拖拽.元素.releasePointerCapture(拖拽.指针编号);
    } catch {
      /* 已经释放过了 */
    }
    this.拖拽 = null;
  }

  射线命中(屏幕x, 屏幕y) {
    const 归一化 = 屏幕转归一化(屏幕x, 屏幕y, this.舞台.画布);
    return this.模型.命中(归一化, this.舞台.相机);
  }

  投出(道具, 坐标) {
    const 结果 = this.道具.发射(道具, 坐标);
    if (!结果 || !结果.成功) return { 成功: false, 是否兜底: false };
    this.记一发(道具);
    return 结果;
  }

  记一发(道具) {
    if (道具.分类 === "投掷") this.状态.记投掷(道具.id);
    else this.状态.记献礼();
  }

  /* ── 控制栏 ─────────────────────────── */

  绑定控制栏() {
    this.元素.控制栏.addEventListener("click", (事件) => {
      const 按钮 = 事件.target.closest(".ctrl");
      if (!按钮) return;
      声音.解锁();
      声音.播放("界面");
      this.执行动作(按钮.dataset.act, 按钮);
    });
  }

  执行动作(动作, 按钮) {
    switch (动作) {
      case "light": {
        const 预设 = this.舞台.切灯光();
        发布("提示", { 文本: 配置.文案.灯光.replace("{名}", 预设.名) });
        break;
      }
      case "camera": {
        this.机位序号 = ((this.机位序号 ?? -1) + 1) % 配置.相机机位.length;
        const 机位 = 配置.相机机位[this.机位序号];
        this.舞台.设置机位(机位);
        this.舞台.暂停自动旋转(4);
        发布("提示", { 文本: 配置.文案.机位.replace("{名}", 机位.名) });
        break;
      }
      case "spin": {
        const 开启 = this.设置旋转(!配置.模型.自动旋转);
        同步开关语义("spin", 开启);
        发布("提示", { 文本: 开启 ? 配置.文案.旋转开 : 配置.文案.旋转关 });
        break;
      }
      case "sound": {
        const 开启 = 声音.切换();
        if (开启) 声音.解锁();
        const 文案 = 开启 ? 配置.按钮文案.声音开 : 配置.按钮文案.声音关;
        const 图 = 按钮.querySelector("span");
        if (图) 图.textContent = 文案.图标;
        const 名 = 按钮.querySelector("em");
        if (名) 名.textContent = 文案.文字;
        if (!图 || !名) {
          按钮.replaceChildren();
          const 新图 = document.createElement("span");
          新图.textContent = 文案.图标;
          const 新名 = document.createElement("em");
          新名.textContent = 文案.文字;
          按钮.append(新图, 新名);
        }
        同步开关语义("sound", 开启);
        发布("提示", { 文本: 开启 ? 配置.文案.声音开 : 配置.文案.声音关 });
        break;
      }
      case "bomb": {
        const 轰炸中 = this.轰炸剩余 > 0;
        this.开始轰炸();
        按钮.classList.toggle("active", this.轰炸剩余 > 0);
        break;
      }
      case "clean":
        发布("清洗");
        break;
      case "shot":
        this.截图();
        break;
      case "help":
        this.刷新成就墙();
        this.元素.帮助遮罩.classList.remove("hidden");
        this.聚帮助();
        break;
      case "voice": {
        const 开启 = 语音.切换();
        按钮.classList.toggle("off", !开启);
        同步开关语义("voice", 开启);
        发布("提示", { 文本: 开启 ? 配置.文案.台词开 : 配置.文案.台词关 });
        break;
      }
      case "poster":
        生成战报({ 舞台: this.舞台, 状态: this.状态, 成就: this.成就, 昵称: this.身份.昵称 });
        break;
      case "disco": {
        const 开着 = this.恶搞?.切换蹦迪() ?? false;
        按钮.classList.toggle("active", 开着);
        同步开关语义("disco", 开着);
        break;
      }
      case "tour": {
        const 开着 = this.切换巡游();
        按钮.classList.toggle("active", 开着);
        break;
      }
      case "theme": {
        const 下 = 切换主题();
        this.提示(下 === 配置.主题.浅色 ? 配置.文案.主题浅色 : 配置.文案.主题深色);
        try {
          按钮.querySelector("em").textContent = 下 === 配置.主题.浅色 ? this.文("主题浅色名") : this.文("主题深色名");
        } catch {
        }
        break;
      }
      case "powersave": {
        const 开 = 切换省电();
        按钮.classList.toggle("active", 开);
        按钮.setAttribute("aria-pressed", 开 ? "true" : "false");
        try {
          按钮.querySelector("em").textContent = 开 ? 取文案(this.语言(), "省电开") : 取文案(this.语言(), "省电关");
        } catch {
        }
        this.提示(开 ? 配置.省电.开启文案 : 配置.省电.关闭文案);
        break;
      }
      case "lang": {
        const 下 = 切换语言();
        try {
          document.documentElement.lang = 下;
        } catch {
        }
        this.应用语言(下);
        break;
      }
      case "youth": {
        const 开 = 切换未成年();
        按钮.classList.toggle("active", 开);
        try {
          按钮.querySelector("em").textContent = 开 ? 取文案(this.语言(), "未成年开") : 取文案(this.语言(), "未成年关");
        } catch {
        }
        this.提示(开 ? 配置.未成年.开启文案 : 配置.未成年.关闭文案);
        if (开 && this.恶搞?.在蹦迪) this.恶搞.切换蹦迪();
        break;
      }
      case "share": {
        this.分享截图();
        break;
      }
      case "actions": {
        this.模型.确保部件?.();
        this.切换动作面板();
        发布("提示", { 文本: 配置.文案.动作面板 });
        break;
      }
      default:
        break;
    }
  }

  开始轰炸() {
    if (this.轰炸剩余 > 0) {
      this.停止轰炸();
      return;
    }
    this.轰炸剩余 = 配置.演出.轰炸道具数;
    this.轰炸计时 = 0;
    发布("轰炸");
    发布("提示", { 文本: 配置.文案.轰炸提示 });
    声音.播放("暴怒", 1.1);
  }

  停止轰炸() {
    this.轰炸剩余 = 0;
    this.轰炸计时 = 0;
    发布("提示", { 文本: 配置.文案.轰炸停止 });
  }

  更新轰炸(步长) {
    if (!this.轰炸剩余) return;
    this.轰炸计时 -= 步长;
    if (this.轰炸计时 > 0) return;
    this.轰炸计时 = 配置.演出.轰炸时长秒 / 配置.演出.轰炸道具数;
    const 池 = 配置.道具.filter((项) => 项.分类 === "投掷");
    const 道具 = 池[Math.floor(Math.random() * 池.length)];
    this.道具.空投(道具);
    this.状态.记投掷(道具.id);
    this.轰炸剩余--;
  }

  /* ── 自动旋转 / 机位巡游 ─────────────── */

  设置旋转(开启) {
    配置.模型.自动旋转 = 开启;
    if (开启) this.舞台.恢复自动旋转();
    else this.舞台.挂起自动旋转();
    return 开启;
  }

  切换巡游() {
    if (this.巡游中) {
      this.停巡游();
      return false;
    }
    this.开巡游();
    return true;
  }

  开巡游() {
    // 蹦迪和巡游都要抢灯光机位，先让蹦迪让位
    if (this.恶搞?.在蹦迪) this.恶搞.切换蹦迪();
    this.原自动旋转 = 配置.模型.自动旋转;
    this.设置旋转(false);
    this.巡游计时 = 0;
    this.巡游序号 = (this.机位序号 ?? 0) + 1;
    this.巡游中 = true;
    发布("巡游", { 开启: true });
    发布("提示", { 文本: 配置.文案.巡游开 });
  }

  停巡游() {
    this.巡游中 = false;
    this.设置旋转(this.原自动旋转);
    发布("巡游", { 开启: false });
    发布("提示", { 文本: 配置.文案.巡游关 });
  }

  更新巡游(步长) {
    if (!this.巡游中) return;
    this.巡游计时 -= 步长;
    if (this.巡游计时 > 0) return;
    this.巡游计时 = 配置.机位巡游.间隔秒;
    const 序号 = this.巡游序号 % 配置.相机机位.length;
    this.巡游序号++;
    this.机位序号 = 序号;
    const 机位 = 配置.相机机位[序号];
    this.舞台.设置机位(机位);
    发布("提示", { 文本: 配置.文案.机位.replace("{名}", 机位.名) });
  }

  /* ── 公告条 ─────────────────────────── */

  启动公告条() {
    const 池 = 配置.公告条.文案池;
    if (!this.元素.公告条文本 || !池.length) return;
    this.元素.公告条文本.textContent = 池[0];
  }

  更新公告条(步长) {
    const 池 = 配置.公告条.文案池;
    const 条 = this.元素.公告条文本;
    if (!条 || !池.length) return;
    this.公告计时 -= 步长;
    if (this.公告计时 > 0) return;
    this.公告计时 = 配置.公告条.间隔秒;
    this.公告序号 = (this.公告序号 + 1) % 池.length;
    条.classList.remove("swap");
    void 条.offsetWidth;
    条.textContent = 池[this.公告序号];
    条.classList.add("swap");
  }

  /* ── 键盘快捷键 ─────────────────────── */

  绑定快捷键() {
    window.addEventListener("keydown", (事件) => {
      if (事件.key === "Escape") {
        if (this.关顶层弹窗()) {
          事件.preventDefault();
          return;
        }
      }
      if (事件.repeat || 事件.ctrlKey || 事件.metaKey || 事件.altKey) return;
      const 目标 = 事件.target;
      if (目标 && (目标.tagName === "INPUT" || 目标.tagName === "TEXTAREA" || 目标.isContentEditable)) return;
      if (this.有弹窗打开()) return;
      if (this.元素.加载遮罩 && !this.元素.加载遮罩.classList.contains("hidden")) return;
      const 条 = 配置.快捷键.键表.find((项) => 项.键 === 事件.key);
      if (!条) return;
      事件.preventDefault();
      this.执行快捷键(条.动作);
    });
  }

  /** YH-027根因治理：弹窗打开时快捷键停用，Esc关闭顶层弹窗 */
  有弹窗打开() {
    const 遮罩打开 = ( el ) => el && !el.classList.contains("hidden");
    if (遮罩打开(this.元素.帮助遮罩)) return true;
    if (遮罩打开(this.元素.取名遮罩)) return true;
    if (this.元素.动作面板 && !this.元素.动作面板.classList.contains("hidden")) return true;
    const 新手 = 取("#新手引导");
    if (新手 && !新手.classList.contains("hidden")) return true;
    return false;
  }

  关顶层弹窗() {
    const 关 = ( el ) => el && !el.classList.contains("hidden");
    if (关(this.元素.取名遮罩) && this.取名模式 === "改名" && this.已取名()) {
      this.关闭取名卡();
      this.回焦点();
      return true;
    }
    if (关(this.元素.帮助遮罩)) {
      this.元素.帮助遮罩.classList.add("hidden");
      this.回焦点();
      return true;
    }
    if (this.元素.动作面板 && !this.元素.动作面板.classList.contains("hidden")) {
      this.切换动作面板(false);
      this.回焦点();
      return true;
    }
    const 新手 = 取("#新手引导");
    if (新手 && !新手.classList.contains("hidden")) {
      新手.classList.add("hidden");
      this.回焦点();
      return true;
    }
    return false;
  }

  聚帮助() {
    try {
      this.打开前焦点 = document.activeElement;
      const 关 = 取("#help-close");
      关?.focus();
      const 罩 = this.元素.帮助遮罩;
      if (罩 && !罩.dataset.陷阱) {
        罩.dataset.陷阱 = "1";
        罩.addEventListener("keydown", (事件) => {
          if (事件.key !== "Tab") return;
          const 可聚 = [...罩.querySelectorAll("button, input, a[href]")].filter(( el ) => !el.disabled && el.offsetParent !== null);
          if (!可聚.length) return;
          const 首 = 可聚[0];
          const 尾 = 可聚[可聚.length - 1];
          if (事件.shiftKey && document.activeElement === 首) {
            事件.preventDefault();
            尾.focus();
          } else if (!事件.shiftKey && document.activeElement === 尾) {
            事件.preventDefault();
            首.focus();
          }
        });
      }
    } catch {
    }
  }

  回焦点() {
    try {
      const 前 = this.打开前焦点;
      if (前 && document.contains(前) && 前.focus) 前.focus();
    } catch {
    }
  }

  执行快捷键(动作) {
    发布("快捷键");
    声音.解锁();
    声音.播放("界面");
    if (动作.startsWith("分类:")) {
      const 分类 = 动作.slice(3);
      if (配置.道具分类.some((项) => 项.id === 分类)) this.切换分类(分类);
      return;
    }
    if (动作 === "点赞") {
      const 矩形 = this.舞台.画布.getBoundingClientRect();
      this.点赞.点赞(矩形.left + 矩形.width / 2, 矩形.top + 矩形.height * 0.45);
      return;
    }
    this.执行动作(动作, this.元素.控制栏?.querySelector(`.ctrl[data-act="${动作}"]`));
  }

  截图() {
    try {
      const 原图 = this.舞台.截图();      const 昵称 = 文件名安全(this.身份?.昵称, 配置.身份.最大长度);
      const 时间戳 = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
      const 图 = new Image();
      图.onload = () => {
        try {
          const 画布 = document.createElement("canvas");
          画布.width = 图.width;
          画布.height = 图.height;
          const 笔 = 画布.getContext("2d");
          笔.drawImage(图, 0, 0);

          const 条高 = Math.max(56, Math.round(画布.height * 0.075));
          const 渐变 = 笔.createLinearGradient(0, 画布.height - 条高, 0, 画布.height);
          渐变.addColorStop(0, "rgba(10,6,16,0)");
          渐变.addColorStop(1, "rgba(10,6,16,0.88)");
          笔.fillStyle = 渐变;
          笔.fillRect(0, 画布.height - 条高, 画布.width, 条高);
          笔.fillStyle = "#ffc53d";
          笔.font = `700 ${Math.round(条高 * 0.42)}px ${配置.字体.战报栈}`;
          笔.textBaseline = "middle";
          笔.fillText(配置.战报.水印, 条高 * 0.5, 画布.height - 条高 * 0.48);

          const 链接 = document.createElement("a");
          链接.href = 画布.toDataURL("image/png");
          链接.download = `${配置.文件名.截图}${昵称}-${时间戳}.png`;
          链接.click();
          发布("提示", { 文本: 配置.文案.截图成功 });
          发布("截图");
        } catch {
          发布("提示", { 文本: 配置.文案.截图失败 });
        }
      };
      图.onerror = () => 发布("提示", { 文本: 配置.文案.截图失败 });
      图.src = 原图;
    } catch {
      发布("提示", { 文本: 配置.文案.截图失败 });
    }
  }

  应用语言(语言) {
    try {
      const 关 = 取("#help-close");
      if (关) 关.textContent = this.文("开整");
      try {
        const 未成年钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="youth"]');
        if (未成年钮) 未成年钮.title = 配置.未成年.说明;
      } catch {
      }
      try {
        const 省电钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="powersave"]');
        if (省电钮) 省电钮.title = 配置.省电.说明;
      } catch {
      }
      const 钮表 = this.元素.控制栏?.querySelectorAll(".ctrl[data-act]");
      if (钮表) {
        for (const 钮 of 钮表) {
          const 动作 = 钮.dataset.act;
          const 名 = 钮.querySelector("em");
          if (!名) continue;
          if (动作 === "help") 名.textContent = this.文("玩法");
          else if (动作 === "poster") 名.textContent = this.文("战报");
          else if (动作 === "actions") 名.textContent = this.文("动作");
          else if (动作 === "theme") 名.textContent = this.文("主题");
          else if (动作 === "powersave") 名.textContent = this.文("省电名");
          else if (动作 === "lang") 名.textContent = this.文("语言名");
          else if (动作 === "youth") 名.textContent = this.文("未成年名");
          else if (动作 === "share") 名.textContent = this.文("分享名");
        }
      }
      const 发送 = this.元素.弹幕发送;
      if (发送) 发送.textContent = this.文("发送");
      const 关注 = this.元素.关注钮;
      if (关注) 关注.textContent = 关注.classList.contains("followed") ? this.文("已关注") : this.文("关注");
      this.提示(语言 === "en" ? 配置.文案.语言英文 : 配置.文案.语言中文);
    } catch {
    }
  }

  async 分享截图() {
    try {
      const 原图 = this.舞台.截图();
      const 图 = new Image();
      图.onload = async () => {
        try {
          const 画布 = document.createElement("canvas");
          画布.width = 图.width;
          画布.height = 图.height;
          const 笔 = 画布.getContext("2d");
          笔.drawImage(图, 0, 0);
          const 口令 = `蜂来现场·${new Date().toISOString().slice(0, 10)}`;
          const 文本 = 配置.分享.截图文本模板.replace("{口令}", 口令);
          try {
            if (画布 && navigator.canShare) {
              const 文件 = await new Promise((成, 败) => 画布.toBlob((b) => (b ? 成(b) : 败(new Error("空图"))), "image/png"));
              const 包 = new File([文件], "蜂来-现场.png", { type: "image/png" });
              if (navigator.canShare({ files: [包] })) {
                await navigator.share({ files: [包], title: 配置.分享.标题, text: 文本 });
                this.提示(配置.分享.截图已分享);
                发布("分享", { 口令, 文本 });
                return;
              }
            }
          } catch (错误) {
            if (String(错误?.name || "") === "AbortError") {
              this.提示(配置.分享.分享取消);
              return;
            }
          }
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(文本);
              this.提示(配置.分享.已复制);
              发布("分享", { 口令, 文本 });
              return;
            }
          } catch {
          }
          const 链接 = document.createElement("a");
          链接.href = 画布.toDataURL("image/png");
          链接.download = `蜂来-现场-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.png`;
          链接.click();
          this.提示(配置.文案.截图成功);
          发布("截图");
        } catch {
          this.提示(配置.文案.截图失败);
        }
      };
      图.onerror = () => this.提示(配置.文案.截图失败);
      图.src = 原图;
    } catch {
      this.提示(配置.文案.截图失败);
    }
  }

  /* ── 弹幕输入 ───────────────────────── */

  绑定弹幕输入() {
    const 提交 = () => {
      // 没取名先拦一道：有身份才发言
      if (!this.已取名()) {
        this.打开取名卡("改名", 配置.文案.先取名);
        return;
      }
      const 值 = 净化文本(this.元素.弹幕输入.value, 配置.安全.弹幕最大长度);
      if (!值) return;
      声音.解锁();
      if (this.弹幕.发送(值, true)) {
        this.元素.弹幕输入.value = "";
      }
    };
    this.元素.弹幕发送.addEventListener("click", 提交);
    this.元素.弹幕高能?.addEventListener("click", () => {
      if (!this.已取名()) {
        this.打开取名卡("改名", 配置.文案.先取名);
        return;
      }
      const 值 = 净化文本(this.元素.弹幕输入.value, 配置.安全.弹幕最大长度);
      if (!值) return;
      声音.解锁();
      if (this.弹幕.发送高能(值)) {
        this.元素.弹幕输入.value = "";
      }
    });
    this.元素.弹幕输入.addEventListener("keydown", (事件) => {
      if (事件.key === "Enter") {
        事件.preventDefault();
        提交();
      }
    });
    // 点输入框也要先有身份，别等用户打完字才说
    this.元素.弹幕输入.addEventListener("focus", () => {
      if (!this.已取名()) {
        this.元素.弹幕输入.blur();
        this.打开取名卡("改名", 配置.文案.先取名);
      }
    });
  }

  绑定帮助() {
    if (this.元素.帮助遮罩 && 配置.合规?.隐私说明) {
      const 隐私段 = this.元素.帮助遮罩.querySelector(".help-privacy");
      if (隐私段) 隐私段.textContent = `隐私说明：${配置.合规.隐私说明}`;
    }
    this.同步帮助文案();
    this.元素.帮助关闭.addEventListener("click", () => {
      this.元素.帮助遮罩.classList.add("hidden");
      this.回焦点();
      声音.播放("界面");
    });
    this.元素.帮助遮罩.addEventListener("click", (事件) => {
      if (事件.target === this.元素.帮助遮罩) {
        this.元素.帮助遮罩.classList.add("hidden");
        this.回焦点();
      }
    });
  }

  同步帮助文案() {
    try {
      const 关 = 取("#help-close");
      if (关) 关.textContent = this.文("开整");
      try {
        const 新手题 = 取("#新手引导标题");
        if (新手题 && !取("#新手引导")?.classList.contains("hidden")) 新手题.textContent = this.文("新手标题");
        const 帮助题 = 取("#help-title");
        if (帮助题) 帮助题.textContent = `🐝 蜂来整蛊舞台 · ${this.文("帮助说明")}`;
      } catch {
      }
      try {
        const 下一步 = 取("#新手引导下一步");
        if (下一步) 下一步.textContent = 配置.新手引导.下一步 || 下一步.textContent;
        const 跳过 = 取("#新手引导跳过");
        if (跳过) 跳过.textContent = 配置.新手引导.跳过 || 跳过.textContent;
      } catch {
      }
      const 页脚 = 取("#help-页脚");
      if (页脚) 页脚.textContent = 配置.直播间.页脚品牌 || "";
      const 互通项 = 取("#help-互通");
      if (互通项) 互通项.textContent = `多标签：${配置.观众.同浏览器声明 || "同浏览器多标签互通"}——同一个浏览器开两个标签，弹幕和点赞会实时互通。`;
      const 榜单 = 取("#help-榜单规则");
      if (榜单) 榜单.textContent = `榜单规则：${配置.礼物.榜单规则 || ""}`;
      const 抽奖 = 取("#help-抽奖规则");
      if (抽奖) 抽奖.textContent = `抽奖规则：${配置.运营.抽奖规则 || ""}`;
      const 品牌 = 取("#help-品牌");
      if (品牌) 品牌.textContent = `品牌故事：${配置.直播间.品牌故事 || ""}`;
      const 运营区 = 取("#help-运营区");
      if (运营区) {
        运营区.replaceChildren();
        const 抽题 = document.createElement("p");
        抽题.className = "help-tip";
        抽题.textContent = `${配置.运营.抽奖规则标题}：${配置.运营.抽奖规则}`;
        const 榜题 = document.createElement("p");
        榜题.className = "help-tip";
        榜题.textContent = `${配置.运营.榜单规则标题}：${配置.礼物.榜单规则}`;
        运营区.append(抽题, 榜题);
      }
      this.刷新埋点区();
      this.刷新存档行();
    } catch {
    }
  }

  刷新埋点区() {
    const 区 = 取("#help-埋点区");
    if (!区) return;
    区.replaceChildren();
    if (!配置.埋点.开启) return;
    const 标题 = document.createElement("p");
    标题.className = "help-tip";
    const 表 = 埋点.读();
    const 明细 = 配置.埋点.事件.map((k) => `${k}${表[k] || 0}`).join("·");
    标题.textContent = `${配置.埋点.战绩页标题}：${明细}`;
    区.append(标题);
  }

  刷新存档行() {
    const 行 = 取("#help-存档行");
    if (!行) return;
    行.replaceChildren();
    const 提示 = (this.状态?.存档状态提示 || (this.成就?.存档仅内存 ? 配置.存档.内存兜底 : "")) || "";
    const 前 = document.createElement("span");
    前.textContent = `存档：本机 localStorage${提示 ? `（${提示}）` : ""} `;
    const 导 = document.createElement("button");
    导.type = "button";
    导.className = "ghost-btn";
    导.textContent = this.文("导出存档");
    导.addEventListener("click", () => {
      this.状态.导出存档();
      this.提示(配置.存档.导出成功);
    });
    const 导入 = document.createElement("label");
    导入.className = "ghost-btn";
    导入.textContent = this.文("导入存档");
    const 文件 = document.createElement("input");
    文件.type = "file";
    文件.accept = "application/json";
    文件.hidden = true;
    文件.addEventListener("change", async () => {
      const 头 = 文件.files?.[0];
      if (!头) return;
      const 文本 = await 头.text().catch(() => "");
      const 成 = this.状态.导入存档(文本);
      this.提示(成 ? 配置.存档.导入成功 : 配置.存档.导入失败);
      this.刷新存档行();
    });
    导入.appendChild(文件);
    行.append(前, 导, document.createTextNode(" "), 导入);
  }

  绑定新手引导() {
    const 罩 = 取("#新手引导");
    if (!罩) return;
    let 步 = 0;
    const 画 = () => {
      const 题 = 取("#新手引导标题");
      const 文 = 取("#新手引导步骤");
      const 下 = 取("#新手引导下一步");
      const 步骤 = 配置.新手引导.步骤 || [];
      if (题) 题.textContent = 配置.新手引导.标题;
      if (文) 文.textContent = `第${步 + 1}步：${步骤[步] || ""}（${步 + 1}/${步骤.length}）`;
      if (下) 下.textContent = 步 >= 步骤.length - 1 ? 配置.新手引导.完成 : 配置.新手引导.下一步;
    };
    const 关 = (记已读) => {
      罩.classList.add("hidden");
      if (记已读) {
        try {
          localStorage.setItem(配置.新手引导.存储键, "1");
        } catch {
        }
      }
    };
    取("#新手引导下一步")?.addEventListener("click", () => {
      const 步骤 = 配置.新手引导.步骤 || [];
      if (步 >= 步骤.length - 1) 关(true);
      else {
        步++;
        画();
      }
    });
    取("#新手引导跳过")?.addEventListener("click", () => 关(true));
    let 已读 = false;
    try {
      已读 = !!localStorage.getItem(配置.新手引导.存储键);
    } catch {
      已读 = true;
    }
    if (!已读) {
      画();
      const 开 = () => {
        try {
          if (罩.dataset.已弹 === "1") return;
          if (罩.dataset.引导停 === "1") return;
          if (localStorage.getItem(配置.新手引导.存储键)) return;
          if (this.已取名 && !this.已取名()) {
            try {
              window.setTimeout(开, 配置.新手引导.延迟毫秒 ?? 14000);
            } catch {
            }
            return;
          }
          const 取名罩 = document.querySelector("#nick-mask");
          if (取名罩 && !取名罩.classList.contains("hidden")) {
            try {
              window.setTimeout(开, 配置.新手引导.延迟毫秒 ?? 14000);
            } catch {
            }
            return;
          }
          画();
          罩.dataset.已弹 = "1";
          罩.classList.remove("hidden");
        } catch {
        }
      };
      setTimeout(开, 配置.新手引导.延迟毫秒 ?? 14000);
    }
  }

  绑定存档区() {
    this.刷新存档行();
    this.刷新埋点区();
    this.刷新治理区();
  }

  语言() {
    try {
      return 当前语言();
    } catch {
      return "zh-CN";
    }
  }

  文(键) {
    return 取文案(this.语言(), 键);
  }

  建治理栏() {
    const 栏 = this.元素.控制栏;
    if (!栏) return;
    if (栏.querySelector('[data-act="theme"]')) return;
    const 造钮 = (动作, 表情, 中文, 标签) => {
      const 钮 = document.createElement("button");
      钮.className = "ctrl";
      钮.dataset.act = 动作;
      钮.type = "button";
      钮.title = 标签;
      钮.setAttribute("aria-label", 标签);
      const 图 = document.createElement("span");
      图.textContent = 表情;
      const 名 = document.createElement("em");
      名.textContent = 中文;
      钮.append(图, 名);
      return 钮;
    };
    const 主题钮 = 造钮("theme", "🌓", "主题", 配置.可访问性.控制按钮标签.theme);
    const 省电钮 = 造钮("powersave", "🔋", "省电", 配置.省电.说明);
    const 语言钮 = 造钮("lang", "🌐", "语言", "语言切换");
    const 未成年钮 = 造钮("youth", "🧒", "未成年", 配置.未成年.说明);
    const 分享钮 = 造钮("share", "📤", "分享", "分享现场截图");
    栏.append(主题钮, 省电钮, 语言钮, 未成年钮, 分享钮);
    try {
      const 省电开 = 当前省电();
      省电钮.classList.toggle("active", 省电开);
      省电钮.setAttribute("aria-pressed", 省电开 ? "true" : "false");
    } catch {
    }
    监视离线(
      () => {
        this.提示(配置.离线.横幅在线);
        try {
          const 横幅 = 取("#offline-banner");
          if (横幅) 横幅.hidden = true;
        } catch {
        }
      },
      () => {
        this.提示(`${配置.离线.横幅离线}；${配置.离线.离线能力}`);
        try {
          const 横幅 = 取("#offline-banner");
          if (横幅) {
            横幅.textContent = `${配置.离线.横幅离线}；${配置.离线.离线能力}`;
            横幅.hidden = false;
          }
        } catch {
        }
      }
    );
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const 横幅 = 取("#offline-banner");
        if (横幅) {
          横幅.textContent = `${配置.离线.横幅离线}；${配置.离线.离线能力}`;
          横幅.hidden = false;
        }
      }
    } catch {
    }
    try {
      const 画布 = this.元素.画布;
      画布?.addEventListener("蜂来上下文丢失", () => {
        this.提示(配置.渲染.上下文丢失);
      });
    } catch {
    }
  }

  绑定未成年提醒() {
    this.未成年在线分 = 0;
    this.未成年已提醒 = new Set();
    setInterval(() => {
      try {
        if (!当前未成年()) return;
        this.未成年在线分 += 1;
        const 间隔 = 配置.未成年.提醒间隔分钟 || 30;
        const 上限 = 配置.未成年.单次上限分钟 || 120;
        if (this.未成年在线分 % 间隔 === 0 && !this.未成年已提醒.has(this.未成年在线分)) {
          this.未成年已提醒.add(this.未成年在线分);
          this.提示(配置.未成年.休息提醒.replace("{分钟}", String(this.未成年在线分)));
        }
        if (this.未成年在线分 >= 上限 && !this.未成年已提醒.has("超")) {
          this.未成年已提醒.add("超");
          this.提示(配置.未成年.超时提醒.replace("{分钟}", String(this.未成年在线分)));
        }
      } catch {
      }
    }, 60000);
  }

  刷新治理区() {
    try {
      const 运营区 = 取("#help-运营区");
      if (!运营区) return;
      let 区 = 取("#help-治理区");
      if (!区) {
        区 = document.createElement("div");
        区.id = "help-治理区";
        const 埋点区 = 取("#help-埋点区");
        if (埋点区) 埋点区.before(区);
        else 运营区.after(区);
      }
      区.replaceChildren();
      const 版本 = document.createElement("p");
      版本.className = "help-tip";
      版本.id = "help-版本行";
      版本.textContent = `版本 ${typeof __蜂来版本__ !== "undefined" ? __蜂来版本__ : "1.0.0"} · ${配置.更新日志.页内链文案 || ""} ${配置.合规.第三方}`;
      const 日志链 = document.createElement("a");
      日志链.href = 配置.更新日志.文件;
      日志链.textContent = 配置.更新日志.页内链文案;
      日志链.style.marginLeft = "8px";
      版本.appendChild(日志链);
      const 名单标题 = document.createElement("p");
      名单标题.className = "help-tip";
      名单标题.textContent = 配置.治理.黑名单标题;
      const 名单表 = document.createElement("p");
      名单表.className = "help-tip";
      const 名单 = 治理.名单();
      名单表.textContent = 名单.length ? 名单.join("、") : 配置.治理.空名单;
      const 举报入 = document.createElement("input");
      举报入.id = "help-举报入";
      举报入.maxLength = 60;
      举报入.placeholder = 配置.治理.举报占位;
      举报入.style.cssText = "width:100%;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:rgba(0,0,0,0.3);color:var(--text);font-size:13px;";
      const 治理钮行 = document.createElement("div");
      治理钮行.className = "nick-actions";
      const 拉黑钮 = document.createElement("button");
      拉黑钮.type = "button";
      拉黑钮.className = "ghost-btn";
      拉黑钮.textContent = 配置.治理.拉黑按钮;
      拉黑钮.addEventListener("click", () => {
        if (!举报入.value.trim()) {
          this.提示(配置.治理.举报空);
          return;
        }
        if (治理.拉黑(举报入.value)) {
          this.提示(配置.治理.拉黑成功.replace("{昵称}", 举报入.value.trim()));
          举报入.value = "";
          this.刷新治理区();
        }
      });
      const 取消钮 = document.createElement("button");
      取消钮.type = "button";
      取消钮.className = "ghost-btn";
      取消钮.textContent = 配置.治理.取消按钮;
      取消钮.addEventListener("click", () => {
        if (!举报入.value.trim()) {
          this.提示(配置.治理.举报空);
          return;
        }
        治理.取消(举报入.value);
        this.提示(配置.治理.取消拉黑.replace("{昵称}", 举报入.value.trim()));
        举报入.value = "";
        this.刷新治理区();
      });
      const 举报钮 = document.createElement("button");
      举报钮.type = "button";
      举报钮.className = "ghost-btn";
      举报钮.textContent = 配置.治理.举报按钮;
      举报钮.addEventListener("click", () => {
        if (!举报入.value.trim()) {
          this.提示(配置.治理.举报空);
          return;
        }
        if (治理.举报(举报入.value)) {
          this.提示(配置.治理.举报成功);
          举报入.value = "";
          this.刷新治理区();
        }
      });
      治理钮行.append(拉黑钮, 取消钮, 举报钮);
      const 政策 = document.createElement("p");
      政策.className = "help-tip";
      const 隐 = document.createElement("a");
      隐.href = 配置.合规.隐私页;
      隐.textContent = "隐私政策";
      const 条 = document.createElement("a");
      条.href = 配置.合规.条款页;
      条.textContent = "服务条款";
      政策.append(document.createTextNode(`${配置.合规.隐私页短}：`), 隐, document.createTextNode(" · "), 条);
      const 错误标题 = document.createElement("p");
      错误标题.className = "help-tip";
      错误标题.textContent = 配置.错误收集.标题;
      const 错误表 = document.createElement("p");
      错误表.className = "help-tip";
      错误表.id = "help-错误行";
      const 列 = 错误收集.读();
      错误表.textContent = 列.length ? 列.slice(-3).map((条) => `${条.时间} ${条.类型}`).join("；") : 配置.错误收集.空;
      const 错误钮行 = document.createElement("div");
      错误钮行.className = "nick-actions";
      const 复制钮 = document.createElement("button");
      复制钮.type = "button";
      复制钮.className = "ghost-btn";
      复制钮.textContent = 配置.错误收集.复制;
      复制钮.addEventListener("click", async () => {
        try {
          await navigator.clipboard?.writeText(JSON.stringify(错误收集.读()));
          this.提示(配置.错误收集.已复制);
        } catch {
        }
      });
      const 清钮 = document.createElement("button");
      清钮.type = "button";
      清钮.className = "ghost-btn";
      清钮.textContent = 配置.错误收集.清空;
      清钮.addEventListener("click", () => {
        错误收集.清();
        this.提示(配置.错误收集.已清空);
        this.刷新治理区();
      });
      错误钮行.append(复制钮, 清钮);
      const 反馈标题 = document.createElement("p");
      反馈标题.className = "help-tip";
      反馈标题.textContent = 配置.反馈.标题;
      const 反馈入 = document.createElement("input");
      反馈入.id = "help-反馈入";
      反馈入.maxLength = 200;
      反馈入.placeholder = 配置.反馈.占位;
      反馈入.style.cssText = "width:100%;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:rgba(0,0,0,0.3);color:var(--text);font-size:13px;";
      const 反馈钮 = document.createElement("button");
      反馈钮.type = "button";
      反馈钮.className = "primary-btn";
      反馈钮.style.cssText = "width:100%;height:34px;margin-top:8px;";
      反馈钮.textContent = 配置.反馈.提交;
      反馈钮.addEventListener("click", () => {
        const 成 = 反馈保存(反馈入.value);
        if (成) {
          反馈入.value = "";
          this.提示(配置.反馈.已收到);
        }
      });
      区.append(版本, 名单标题, 名单表, 举报入, 治理钮行, 政策, 错误标题, 错误表, 错误钮行, 反馈标题, 反馈入, 反馈钮);
    } catch {
    }
  }

  /* ── 昵称 / 取名卡 ──────────────────── */

  已取名() {
    return !!(this.身份?.已确认 && this.身份?.昵称);
  }

  绑定取名() {
    const 确认 = () => {
      const 现在 = performance.now();
      const 间隔 = 配置.面板?.改名节流毫秒 ?? 3000;
      if (this.上次改名 && 现在 - this.上次改名 < 间隔) {
        this.元素.取名错误.textContent = 配置.面板?.改名过快 || "改名太频繁，稍后再试";
        return;
      }
      const 值 = 净化文本(this.元素.取名输入.value, 配置.身份.最大长度);
      if (!值) {
        this.元素.取名错误.textContent = 配置.文案.取名空;
        return;
      }
      this.上次改名 = 现在;
      this.身份 = 写身份(值, true);
      this.弹幕.昵称 = this.身份.昵称;
      this.关闭取名卡();
      发布("取名", { 昵称: this.身份.昵称, 来源: this.取名模式 });
      发布("提示", { 文本: `${this.取名模式 === "改名" ? 配置.文案.改名成功 : 配置.文案.取名成功}${this.身份.昵称}` });
    };

    this.元素.取名确认.addEventListener("click", () => {
      声音.解锁();
      声音.播放("界面");
      确认();
    });
    this.元素.取名输入.addEventListener("keydown", (事件) => {
      if (事件.key === "Enter") {
        事件.preventDefault();
        确认();
      }
    });
    this.元素.取名跳过.addEventListener("click", () => {
      声音.解锁();
      声音.播放("界面");
      this.身份 = 写身份("", true);
      this.弹幕.昵称 = this.身份.昵称;
      this.关闭取名卡();
      发布("取名", { 昵称: this.身份.昵称, 来源: "跳过" });
      发布("提示", { 文本: `${配置.文案.取名成功}${this.身份.昵称}` });
    });
    this.元素.昵称钮.addEventListener("click", () => {
      声音.解锁();
      声音.播放("界面");
      this.打开取名卡("改名");
    });
    this.元素.取名遮罩.addEventListener("click", (事件) => {
      // 首次进站必须选一个（取名或跳过），改名时点外面可以直接关掉
      if (事件.target === this.元素.取名遮罩 && this.取名模式 === "改名" && this.已取名()) {
        this.关闭取名卡();
      }
    });
  }

  打开取名卡(模式 = "首次", 提示 = "") {
    this.取名模式 = 模式;
    const 遮罩 = this.元素.取名遮罩;
    if (!遮罩) return;
    try {
      this.打开前焦点 = document.activeElement;
    } catch {
    }    this.元素.取名标题.textContent =
      模式 === "改名" ? 配置.文案.改名标题 : 配置.文案.取名标题;
    this.元素.取名提示.textContent = 提示 || (模式 === "改名" ? 配置.文案.改名提示 : 配置.文案.取名提示);
    this.元素.取名错误.textContent = "";
    this.元素.取名输入.value = 模式 === "改名" ? this.身份?.昵称 || "" : "";
    // 首次进站没有「跳过」以外的退路，改名时允许直接关掉
    this.元素.取名跳过.textContent = 模式 === "改名" ? "随便来一个" : "跳过，随便来一个";
    遮罩.classList.remove("hidden");
    setTimeout(() => this.元素.取名输入.focus(), 60);
  }

  关闭取名卡() {
    this.元素.取名遮罩.classList.add("hidden");
    this.刷新昵称钮();
    this.回焦点();
  }

  /** 模型加载完成后调用：没取过名就弹卡 */
  检查取名() {
    if (!this.已取名()) this.打开取名卡("首次");
  }

  刷新昵称钮() {
    const 钮 = this.元素.昵称钮;
    if (!钮) return;
    钮.textContent = this.已取名() ? this.身份.昵称 : "取个名号";
    钮.title = this.已取名() ? `${this.身份.昵称}（点击改名）` : "点击取名";
  }

  /* ── 蜜蜂彩蛋：连点 logo ─────────────── */

  绑定蜜蜂() {
    const 标 = this.元素.蜜蜂标;
    if (!标) return;
    标.style.cursor = "pointer";
    标.addEventListener("click", () => {
      声音.解锁();
      const 现在 = performance.now();
      const 窗口 = 配置.蜜蜂雨.窗口毫秒;
      this.蜜蜂连点 = this.蜜蜂连点.filter((t) => 现在 - t <= 窗口);
      this.蜜蜂连点.push(现在);
      标.style.transform = `scale(${1 + Math.min(0.5, this.蜜蜂连点.length * 0.06)})`;
      if (this.蜜蜂连点.length >= 配置.蜜蜂雨.连点次数) {
        this.蜜蜂连点 = [];
        发布("蜜蜂雨");
      }
    });
  }

  /* ── 成就墙 ─────────────────────────── */

  绑定成就行() {
    this.元素.成就行?.addEventListener("click", () => {
      this.刷新成就墙();
      this.元素.帮助遮罩.classList.remove("hidden");
      this.聚帮助();
      声音.播放("界面");
    });
  }

  刷新成就墙() {
    const 文本 = `${this.成就.已解锁数}/${this.成就.总数}`;
    if (this.元素.成就数) this.元素.成就数.textContent = 文本;
    if (this.元素.成就数帮助) this.元素.成就数帮助.textContent = 文本;

    const 墙 = this.元素.成就墙;
    if (!墙) return;
    墙.replaceChildren();
    for (const 项 of 配置.成就列表) {
      const 已得 = this.成就.有(项.id);
      const 徽 = document.createElement("div");
      徽.className = "medal" + (已得 ? " got" : "");
      徽.dataset.medal = 项.id;
      徽.title = 已得 ? `${项.名} · ${项.说明}` : "未解锁";
      const 图 = document.createElement("b");
      图.textContent = 项.图标;
      const 名 = document.createElement("span");
      名.textContent = 已得 ? 项.名 : "？？？";
      徽.append(图, 名);
      墙.appendChild(徽);
    }
  }

  /* ── 人气 / 标签数 ──────────────────── */

  刷新人气开关() {
    if (this.元素.人气区) this.元素.人气区.style.display = 配置.人气.显示 ? "" : "none";
  }

  绑定关注钮() {
    const 钮 = this.元素.关注钮;
    if (!钮) return;
    钮.addEventListener("click", () => {
      声音.解锁();
      声音.播放("界面");
      const 已关注 = 钮.classList.toggle("followed");
      钮.textContent = 已关注 ? 配置.直播间.关注按钮关 : 配置.直播间.关注按钮开;
      发布("提示", { 文本: 已关注 ? 配置.直播间.关注成功 : 配置.直播间.关注再次 });
      发布("关注");
      this.成就.解锁("关注");
    });
  }

  绑定快捷表情() {
    const 栏 = this.元素.表情栏;
    if (!栏) return;
    // 根因：快捷表情栏以前是输入行里的 inline 元素，6 个表情挤在一行，
    // 窄屏/横屏下把发送按钮挤出输入栏。改为悬浮条后只留输入三件套，表情独立成行。
    栏.replaceChildren();
    for (const 表情 of 配置.表情.快捷表) {
      const 钮 = document.createElement("button");
      钮.className = "emoji-btn";
      钮.type = "button";
      钮.textContent = 表情;
      钮.title = 配置.表情.快捷文案;
      钮.addEventListener("click", () => {
        if (!this.已取名()) {
          this.打开取名卡("改名", 配置.文案.先取名);
          return;
        }
        声音.解锁();
        声音.播放("界面");
        this.弹幕.发送(表情, true);
        发布("表情");
      });
      栏.appendChild(钮);
    }
  }

  初始化气氛系统() {
    if (!this.元素.进场层 || !this.元素.礼物层 || !this.元素.榜单 || !this.元素.榜单标题) return;
    this.气氛 = new 气氛系统({
      进场层: this.元素.进场层,
      礼物层: this.元素.礼物层,
      榜单: this.元素.榜单,
      榜单标题: this.元素.榜单标题,
      取昵称: () => this.身份.昵称,
    });
  }

  /* ── 事件订阅 ───────────────────────── */

  订阅事件() {
    订阅("提示", ({ 文本 }) => this.提示(文本));
    订阅("动作", ({ 名 }) => this.动作面板高亮(名 === "待机" ? null : 名));
    订阅("连击", ({ 连击 }) => this.显示连击(连击));
    订阅("暴怒", ({ 进入 }) => {
      this.元素.暴怒闪屏.classList.toggle("on", 进入);
      if (进入) {
        发布("台词", { 文本: 随机取(配置.台词.暴怒), 分类: "暴怒", 强制: true });
        声音.播放("暴怒");
        this.舞台.震一下(20);
      } else {
        发布("台词", { 文本: 随机取(配置.台词.暴怒结束), 分类: "暴怒结束", 强制: true });
      }
    });
    订阅("称号变化", ({ 称号 }) => {
      this.元素.称号.classList.add("pop");
      setTimeout(() => this.元素.称号.classList.remove("pop"), 260);
      this.提示(配置.文案.称号进化.replace("{称号}", 称号));
      声音.播放("里程碑");
    });
    订阅("清洗", () => {
      this.特效.清洗(
        new THREE.Vector3(this.模型.中心.x, this.模型.包围盒.max.y * 0.7, this.模型.中心.z)
      );
      声音.播放("喷射");
      this.状态.加愤怒(-12);
    });
    订阅("台词", ({ 文本, 强制 }) => this.说(文本, 强制));
    订阅("标签数变化", ({ 数 }) => {
      if (this.元素.标签数) this.元素.标签数.textContent = String(数);
      this.元素.标签区?.classList.add("bump");
      setTimeout(() => this.元素.标签区?.classList.remove("bump"), 420);
    });
    订阅("成就解锁", ({ 成就, 已解锁数, 总数 }) => {
      this.提示成就(成就, 已解锁数, 总数);
      this.刷新成就墙();
      声音.播放("里程碑");
    });
    订阅("战报", () => {
      this.刷新埋点区();
    });
    订阅("分享", ({ 口令 }) => {
      this.刷新埋点区();
      if (口令 && this.弹幕) {
        try {
          if (String(口令).startsWith(配置.分享.口令前缀)) {
            this.提示(配置.分享.已复制);
          }
        } catch {
        }
      }
    });
    订阅("本地弹幕", ({ 内容 }) => {
      const 口令头 = 配置.分享.口令前缀;
      if (口令头 && String(内容 || "").includes(口令头)) {
        this.提示(配置.分享.已复制);
      }
    });
  }

  /* ── 输出类组件 ─────────────────────── */

  提示(文本) {
    const 元素 = document.createElement("div");
    元素.className = "toast";
    元素.textContent = 净化文本(文本, 60);
    this.元素.提示层.appendChild(元素);
    setTimeout(() => 元素.remove(), 配置.提示?.单条存活毫秒 ?? 3600);
    // 提示太多会堆满，超出的先撤
    while (this.元素.提示层.childElementCount > (配置.提示?.同屏上限 ?? 2)) this.元素.提示层.firstElementChild.remove();
  }

  提示成就(成就, 已解锁数, 总数) {
    const 元素 = document.createElement("div");
    元素.className = "toast achv";
    const 主 = document.createElement("div");
    主.textContent = `${配置.文案.成就解锁}：${成就.图标} ${成就.名}`;
    const 副 = document.createElement("small");
    副.textContent = `${成就.说明} · ${已解锁数}/${总数}`;
    元素.append(主, 副);
    this.元素.提示层.appendChild(元素);
    setTimeout(() => 元素.remove(), 配置.提示?.成就存活毫秒 ?? 3600);
    while (this.元素.提示层.childElementCount > (配置.提示?.同屏上限 ?? 2)) this.元素.提示层.firstElementChild.remove();
  }

  显示连击(连击) {
    const 元素 = this.元素.连击弹;
    if (连击 < 2) {
      元素.classList.remove("hit");
      元素.style.opacity = "0";
      return;
    }
    元素.textContent = `${连击} 连击`;
    void 元素.offsetWidth;
    元素.classList.add("hit");
    元素.style.opacity = "0.9";
  }

  说(文本, 强制 = false) {
    if (!强制 && this.气泡剩余 > 0) return;
    this.元素.气泡.textContent = 净化文本(文本, 80);
    this.气泡剩余 = 3.2;
    this.台词冷却 = 4;
  }

  更新气泡(步长) {
    this.气泡剩余 = Math.max(0, this.气泡剩余 - 步长);
    this.台词冷却 = Math.max(0, this.台词冷却 - 步长);

    const 气泡 = this.元素.气泡;
    if (this.气泡剩余 <= 0) {
      气泡.classList.remove("show");
      return;
    }
    const 头部 = new THREE.Vector3(
      this.模型.中心.x,
      this.模型.包围盒.max.y + 0.08,
      this.模型.中心.z
    );
    const 屏幕 = 世界转客户端(头部, this.舞台.相机, this.舞台.画布);
    气泡.style.left = `${屏幕.x}px`;
    气泡.style.top = `${屏幕.y}px`;
    气泡.classList.add("show");
  }

  /* ── 每帧刷新 ───────────────────────── */

  刷新() {
    const { 状态 } = this;
    const 取整 = (值) => String(Math.round(值));
    if (this.上次面板?.好感 !== 取整(状态.好感)) {
      this.元素.好感值.textContent = 取整(状态.好感);
      this.元素.好感条.style.width = `${(状态.好感比例 * 100).toFixed(1)}%`;
    }
    if (this.上次面板?.愤怒 !== 取整(状态.愤怒)) {
      this.元素.愤怒值.textContent = 取整(状态.愤怒);
      this.元素.愤怒条.style.width = `${(状态.愤怒比例 * 100).toFixed(1)}%`;
    }
    const 点赞文 = 格式化数字(状态.点赞数);
    if (this.上次面板?.点赞 !== 点赞文) this.元素.点赞数.textContent = 点赞文;
    const 连击文 = String(状态.连击);
    if (this.上次面板?.连击 !== 连击文) this.元素.连击数.textContent = 连击文;
    const 投掷文 = String(状态.投掷数 + 状态.献礼数);
    if (this.上次面板?.投掷 !== 投掷文) this.元素.投掷数.textContent = 投掷文;
    if (this.上次面板?.称号 !== 状态.称号) this.元素.称号.textContent = 状态.称号;
    const 停留文 = 格式化时长(状态.在场秒);
    if (this.上次面板?.停留 !== 停留文) this.元素.停留.textContent = 停留文;
    this.上次面板 = { 好感: 取整(状态.好感), 愤怒: 取整(状态.愤怒), 点赞: 点赞文, 连击: 连击文, 投掷: 投掷文, 称号: 状态.称号, 停留: 停留文 };

    const 抖动 = Math.sin(状态.在场秒 * 0.7) * 3;
    this.元素.在线.textContent = Math.round(this.在线基数 + 抖动 + 状态.点赞数 / 7).toLocaleString("zh-CN");

    if (配置.人气.显示) {
      const 人气 = Math.max(0, Math.round(状态.人气显示));
      this.元素.人气.textContent = 格式化数字(人气);
      if (this.上次人气 !== null && 人气 - this.上次人气 >= 3) {
        this.元素.人气区.classList.remove("bump");
        void this.元素.人气区.offsetWidth;
        this.元素.人气区.classList.add("bump");
      }
      this.上次人气 = 人气;
    }

    // 省电档会自动关旋转，这里把按钮状态同步回去
    if (this.上次旋转态 !== 配置.模型.自动旋转) {
      this.上次旋转态 = 配置.模型.自动旋转;
      const 钮 = this.元素.控制栏?.querySelector('.ctrl[data-act="spin"]');
      if (钮) {
        钮.classList.toggle("off", !配置.模型.自动旋转);
        同步开关语义("spin", 配置.模型.自动旋转);
      }
    }

    this.模型.设置怒气(状态.愤怒比例 * (状态.暴怒中 ? 1.6 : 1));
  }

  /** 空闲时偶尔冒一句话 */
  更新台词(步长) {
    if (this.台词冷却 > 0 || this.气泡剩余 > 0) return;
    this.台词计时 -= 步长;
    if (this.台词计时 > 0) return;
    this.台词计时 = 14 + Math.random() * 12;
    发布("台词", { 文本: 随机取(配置.台词.空闲) });
  }

  更新(步长) {
    this.刷新();
    this.更新气泡(步长);
    this.更新台词(步长);
    this.更新轰炸(步长);
    this.更新巡游(步长);
    this.更新公告条(步长);
    this.气氛?.更新(步长);
  }

  切换关注() {
    const 钮 = this.元素.关注钮;
    if (!钮) return false;
    const 已关注 = 钮.classList.toggle("followed");
    钮.textContent = 已关注 ? 配置.直播间.关注按钮关 : 配置.直播间.关注按钮开;
    发布("提示", { 文本: 已关注 ? 配置.直播间.关注成功 : 配置.直播间.关注再次 });
    发布("关注");
    this.成就.解锁("关注");
    return true;
  }

  切换榜单() {
    // 榜单始终可见，这里只是触发一下成就
    发布("上榜");
    this.成就.解锁("上榜");
    return true;
  }

  /* ── 加载 ───────────────────────────── */

  设置进度(比例, 说明) {
    const 数值 = Number(比例);
    if (!Number.isFinite(数值)) return;
    if (!this.元素.加载条) return;
    const 已发 = Number(this.元素.加载条.dataset.已发 || "0");
    const 下一 = Math.max(Number.isFinite(已发) ? 已发 : 0, Math.min(1, 数值));
    this.元素.加载条.dataset.已发 = String(下一);
    this.元素.加载条.style.width = `${Math.round(下一 * 100)}%`;
    if (说明) this.元素.加载文字.textContent = 说明;
  }

  完成加载() {
    this.元素.加载遮罩.classList.add("hidden");
    this.元素.加载遮罩.setAttribute("aria-hidden", "true");
  }

  加载失败(说明) {
    const 遮罩 = this.元素.加载遮罩;
    遮罩.classList.add("error");
    const 标题 = 遮罩.querySelector(".loading-title");
    if (标题) 标题.textContent = 配置.文案.加载失败标题;
    this.元素.加载文字.textContent = 说明;
  }
}
