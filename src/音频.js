import { 配置 } from "./配置.js";
import { 夹取, 随机 } from "./工具.js";

/**
 * 纯 WebAudio 合成音效，不加载任何音频文件。
 * 浏览器要求用户先交互才能出声，所以首次点击时会 resume。
 */
class 声音系统 {
  constructor() {
    this.上下文 = null;
    this.主增益 = null;
    this.开启 = true;
    this.在响 = 0;
    this.噪声缓冲 = null;
  }

  初始化() {
    if (this.上下文) return;
    const 构造器 = window.AudioContext || window.webkitAudioContext;
    if (!构造器) return;
    try {
      this.上下文 = new 构造器();
      this.主增益 = this.上下文.createGain();
      this.主增益.gain.value = 配置.声音.主音量;
      this.主增益.connect(this.上下文.destination);
      this.噪声缓冲 = this.造噪声缓冲();
    } catch {
      this.上下文 = null;
    }
  }

  造噪声缓冲() {
    const 长度 = Math.floor(this.上下文.sampleRate * 1.2);
    const 缓冲 = this.上下文.createBuffer(1, 长度, this.上下文.sampleRate);
    const 数据 = 缓冲.getChannelData(0);
    for (let i = 0; i < 长度; i++) 数据[i] = Math.random() * 2 - 1;
    return 缓冲;
  }

  /** 任何用户手势后调用，解锁音频 */
  解锁() {
    this.初始化();
    if (this.上下文 && this.上下文.state === "suspended") this.上下文.resume();
  }

  切换() {
    this.开启 = !this.开启;
    if (this.主增益) this.主增益.gain.value = this.开启 ? 配置.声音.主音量 : 0;
    return this.开启;
  }

  能响() {
    return this.开启 && this.上下文 && this.上下文.state === "running" && this.在响 < 配置.声音.最大并发声源;
  }

  /** 单个正弦/方波扫频音 */
  音(参数) {
    if (!this.能响()) return;
    const 现在 = this.上下文.currentTime;
    const { 起始频率 = 440, 结束频率 = 起始频率, 时长 = 0.2, 音量 = 0.4, 类型 = "sine", 延迟 = 0 } = 参数;
    const 起 = 现在 + 延迟;
    const 振荡 = this.上下文.createOscillator();
    const 增益 = this.上下文.createGain();
    振荡.type = 类型;
    振荡.frequency.setValueAtTime(起始频率, 起);
    if (结束频率 !== 起始频率) 振荡.frequency.exponentialRampToValueAtTime(Math.max(1, 结束频率), 起 + 时长);
    增益.gain.setValueAtTime(0.0001, 起);
    增益.gain.exponentialRampToValueAtTime(音量, 起 + Math.min(0.02, 时长 * 0.2));
    增益.gain.exponentialRampToValueAtTime(0.0001, 起 + 时长);
    振荡.connect(增益).connect(this.主增益);
    振荡.start(起);
    振荡.stop(起 + 时长 + 0.02);
    this.在响++;
    振荡.onended = () => { this.在响--; };
  }

  /** 一段带滤波的噪声，用来做泼溅/碎裂/掌声/喷射 */
  噪声(参数) {
    if (!this.能响()) return;
    const 现在 = this.上下文.currentTime;
    const {
      时长 = 0.25,
      音量 = 0.5,
      起始截止 = 6000,
      结束截止 = 400,
      滤波类型 = "lowpass",
      延迟 = 0,
      Q = 1,
    } = 参数;
    const 起 = 现在 + 延迟;
    const 源 = this.上下文.createBufferSource();
    源.buffer = this.噪声缓冲;
    const 滤波 = this.上下文.createBiquadFilter();
    滤波.type = 滤波类型;
    滤波.Q.value = Q;
    滤波.frequency.setValueAtTime(起始截止, 起);
    滤波.frequency.exponentialRampToValueAtTime(Math.max(40, 结束截止), 起 + 时长);
    const 增益 = this.上下文.createGain();
    增益.gain.setValueAtTime(0.0001, 起);
    增益.gain.exponentialRampToValueAtTime(音量, 起 + Math.min(0.015, 时长 * 0.15));
    增益.gain.exponentialRampToValueAtTime(0.0001, 起 + 时长);
    源.connect(滤波).connect(增益).connect(this.主增益);
    源.start(起, 随机(0, 0.3));
    源.stop(起 + 时长 + 0.02);
    this.在响++;
    源.onended = () => { this.在响--; };
  }

  /**
   * 按名字播放配置里的音效。
   * 上下文只在用户手势（解锁）后创建，避免无手势时新建 AudioContext 触发浏览器警告。
   */
  播放(名, 变调 = 1) {
    if (!this.开启) return;
    if (!this.上下文) return;
    if (this.上下文.state === "suspended") this.上下文.resume();

    const 定义 = 配置.声音.各音效[名];
    if (!定义) return;
    const 音量 = 夹取((定义.音量 ?? 0.4) * (配置.声音.主音量 / 0.55), 0, 1);

    if (定义.连放次数) {
      for (let i = 0; i < 定义.连放次数; i++) {
        const 抖 = 随机(0.75, 1.3) * 变调;
        this.噪声({ 时长: 定义.时长, 音量: 音量 * 随机(0.6, 1), 起始截止: 随机(3500, 8000), 结束截止: 随机(300, 900), 延迟: i * 定义.间隔 });
        if (定义.起始频率) this.音({ 起始频率: 定义.起始频率 * 抖, 结束频率: (定义.结束频率 ?? 定义.起始频率) * 抖, 时长: 定义.时长, 音量: 音量 * 0.5, 类型: "square", 延迟: i * 定义.间隔 });
      }
      return;
    }

    if (定义.类型) {
      this.音({
        起始频率: (定义.起始频率 ?? 440) * 变调,
        结束频率: (定义.结束频率 ?? 定义.起始频率 ?? 440) * 变调,
        时长: 定义.时长,
        音量,
        类型: 定义.类型,
      });
      return;
    }

    // 没有指定波形类型的一律当噪声类处理
    switch (名) {
      case "泼溅":
        this.噪声({ 时长: 定义.时长, 音量, 起始截止: 5200, 结束截止: 260, 滤波类型: "lowpass" });
        this.音({ 起始频率: 320 * 变调, 结束频率: 110 * 变调, 时长: 0.14, 音量: 音量 * 0.35, 类型: "sine" });
        break;
      case "碎裂":
        this.噪声({ 时长: 定义.时长, 音量, 起始截止: 9000, 结束截止: 1200, 滤波类型: "highpass" });
        this.音({ 起始频率: 900 * 变调, 结束频率: 300 * 变调, 时长: 0.1, 音量: 音量 * 0.4, 类型: "triangle" });
        break;
      case "喷射":
        this.噪声({ 时长: 定义.时长, 音量, 起始截止: 2600, 结束截止: 900, 滤波类型: "bandpass", Q: 0.8 });
        break;
      default:
        this.噪声({ 时长: 定义.时长, 音量, 起始截止: 5000, 结束截止: 500 });
    }
  }

  /** 点赞连击时按音阶逐级升调 */
  播放音阶(序号) {
    const 音阶 = 配置.点赞.连击音阶;
    const 频率 = 音阶[Math.min(序号, 音阶.length - 1)];
    this.音({ 起始频率: 频率, 结束频率: 频率 * 1.5, 时长: 0.16, 音量: 0.28, 类型: "triangle" });
  }
}

export const 声音 = new 声音系统();
