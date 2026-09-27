import { 配置 } from "./配置.js";
import { 散列键 } from "./工具.js";
import { 声音 } from "./音频.js";
import { 发布 } from "./事件.js";

/** 台词池里最常开口的那几句，开麦后预热用 */
function 常用台词() {
  const 列表 = [配置.文案.开场白];
  for (const 池 of Object.values(配置.台词)) {
    if (Array.isArray(池) && 池.length) 列表.push(池[0]);
  }
  return [...new Set(列表.filter(Boolean))];
}

/**
 * 主播语音，两档引擎：
 *  - edge：播 tools/烘焙语音.cjs 烘焙好的 Edge TTS 片段（public/audio/vo/*.mp3，纯静态、可离线）
 *  - browser：浏览器自带 speechSynthesis，音色随系统走
 * 片段按台词文本的散列命名，缺失或加载失败就退到 browser，全程静默降级，不抛错、不刷警告。
 */
class 语音系统 {
  constructor() {
    this.开启 = 配置.语音.默认开启;
    this.上次 = 0;
    this.在播 = new Set();
    this.片段 = new Map();
    this.没有片段 = new Set();
    this.提示过兜底 = false;
    this.清单 = null;
    this.清单拉过 = false;
  }

  get 引擎名() {
    return "主播原声";
  }

  async 读清单() {
    if (this.清单 || this.清单拉过) return this.清单;
    this.清单拉过 = true;
    try {
      const 目录 = 配置.语音.片段目录.replace(/\/+$/, "");
      const 响应 = await fetch(`${目录}/清单.json`, { cache: "force-cache" });
      if (!响应.ok) return null;
      const 数据 = await 响应.json();
      this.清单 = new Set(Object.keys(数据 || {}));
      this.清单文本 = 数据 || {};
      for (const 键 of this.清单) this.没有片段.delete(键);
      return this.清单;
    } catch {
      return null;
    }
  }

  切换() {
    this.开启 = !this.开启;
    if (!this.开启) this.闭嘴();
    else {
      this.读清单();
      this.预热();
    }
    return this.开启;
  }

  闭嘴() {
    for (const 声音源 of this.在播) {
      try {
        声音源.pause();
      } catch {
        /* 已经播完了 */
      }
      this.在播.delete(声音源);
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* 部分无头环境没有这套 API */
    }
  }

  说(文本) {
    if (!this.开启 || !文本 || !声音.开启) return;
    const 现在 = performance.now();
    if (现在 - this.上次 < 配置.语音.最小间隔毫秒) return;
    this.上次 = 现在;

    const 内容 = String(文本).slice(0, 80);
    const 键 = 散列键(内容);
    const 旧词 = (this.清单文本?.[键] || "");
    if (旧词.includes("破费") || 旧词.includes("老板")) {
      this.没有片段.add(键);
      this.系统声音(内容);
      return;
    }
    if (配置.语音.引擎 === "edge" && !this.没有片段.has(键)) {
      if (this.清单) {
        if (this.清单.has(键)) this.播片段(键, 内容);
        else this.系统声音(内容);
        return;
      }
      this.读清单().then((清单) => {
        if (清单 && !清单.has(键)) {
          this.没有片段.add(键);
          this.系统声音(内容);
          return;
        }
        this.播片段(键, 内容);
      });
      return;
    }
    this.系统声音(内容);
  }

  片段地址(键) {
    const 目录 = 配置.语音.片段目录.replace(/\/+$/, "");
    return `${目录}/${键}${配置.语音.片段后缀}`;
  }

  取片段(键) {
    if (this.片段.has(键)) return this.片段.get(键);
    let 声音源;
    try {
      声音源 = new Audio();
    } catch {
      return null;
    }
    声音源.preload = "auto";
    声音源.src = this.片段地址(键);
    声音源.playbackRate = 配置.语音.语速;
    声音源.volume = 配置.语音.音量;
    声音源.addEventListener("ended", () => this.在播.delete(声音源), { once: true });
    声音源.addEventListener("error", () => {
      this.片段.delete(键);
      this.在播.delete(声音源);
      this.没有片段.add(键);
    });
    this.片段.set(键, 声音源);
    return 声音源;
  }

  播片段(键, 内容) {
    if (this.在播.size >= 配置.语音.最多同时) return;
    const 声音源 = this.取片段(键);
    if (!声音源) return this.系统声音(内容);
    this.在播.add(声音源);
    声音源
      .play()
      .catch(() => {
        this.在播.delete(声音源);
        this.没有片段.add(键);
        this.系统声音(内容);
      });
  }

  系统声音(文本) {
    if (!this.提示过兜底) {
      this.提示过兜底 = true;
      if (配置.语音.引擎 === "edge") 发布("提示", { 文本: 配置.文案.语音兜底 });
    }
    const 合成 = window.speechSynthesis;
    if (!合成 || typeof window.SpeechSynthesisUtterance !== "function") return;
    try {
      合成.cancel();
      const 句 = new SpeechSynthesisUtterance(String(文本).slice(0, 80));
      句.lang = 配置.语音.语言;
      句.rate = 配置.语音.语速;
      句.pitch = 配置.语音.音调;
      句.volume = 配置.语音.音量;
      const 声 = this.选中文声();
      if (声) 句.voice = 声;
      合成.speak(句);
    } catch {
    }
  }

  选中文声() {
    try {
      const 列表 = window.speechSynthesis?.getVoices?.() || [];
      return 列表.find((v) => /zh|cmn|Chinese/i.test(`${v.lang} ${v.name}`)) || null;
    } catch {
      return null;
    }
  }

  /** 开麦后先把常开口的那几句拉下来，省得第一句要等网络 */
  预热() {
    if (!配置.语音.预热 || 配置.语音.引擎 !== "edge") return;
    const 拉 = async () => {
      const 清单 = await this.读清单();
      for (const 文本 of 常用台词()) {
        const 键 = 散列键(文本);
        if (this.没有片段.has(键)) continue;
        if (清单 && !清单.has(键)) {
          this.没有片段.add(键);
          continue;
        }
        this.取片段(键);
      }
    };
    拉();
  }
}

export const 语音 = new 语音系统();
