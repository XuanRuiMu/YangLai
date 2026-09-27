import * as THREE from "three";
import { 配置, 随机取 } from "./配置.js";
import { 世界转客户端, 屏幕转归一化, 随机整数 } from "./工具.js";
import { 发布 } from "./事件.js";

/** 移动超过这个像素就当作在拖视角，不触发标注 */
const 移动容差 = () => 配置.手势.长按判定像素;

/**
 * 吐槽标注：鼠标按住 350ms（或触屏长按、或右键点一下）模型任意部位，
 * 在那块弹一条吐槽标签。用来"逐块检查"模型，也用来指点江山。
 */
export class 吐槽标注 {
  constructor({ 舞台, 模型, 层 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.层 = 层;
    this.绑定();
  }

  绑定() {
    const 画布 = this.舞台.画布;
    let 按下 = null;
    let 计时器 = null;

    const 清计时器 = () => {
      if (计时器) {
        clearTimeout(计时器);
        计时器 = null;
      }
    };

    // 根因：右键标注链路依赖pointerdown/up（button=2），但部分合成事件
    // （Playwright mouse.down/up）只派发mousedown/mouseup+contextmenu而不派发
    // pointer事件，导致链路走不到戳一下；且mousemove会清掉按下态。
    // 修根：右键链路同时监听mouse系三件套，并用contextmenu作最终兜底。
    const 记录按下 = (x, y, 按钮) => {
      按下 = { x, y, 按钮 };
    };
    const 右键松开 = (x, y) => {
      if (!按下 || 按下.按钮 !== 2) return;
      const 是右键单击 = Math.hypot(x - 按下.x, y - 按下.y) <= 移动容差();
      按下 = null;
      清计时器();
      if (是右键单击) this.戳一下(x, y);
    };

    画布.addEventListener("pointerdown", (事件) => {
      if (事件.button !== 0 && 事件.button !== 2) return;
      // pointerdown对右键只记录不计时，避免与mousedown重复建计时器
      记录按下(事件.clientX, 事件.clientY, 事件.button);
      if (事件.button !== 0) return;
      清计时器();
      计时器 = setTimeout(() => this.戳一下(事件.clientX, 事件.clientY), 配置.标注.长按毫秒);
    });

    画布.addEventListener("mousedown", (事件) => {
      if (事件.button !== 2) return;
      记录按下(事件.clientX, 事件.clientY, 事件.button);
    });

    画布.addEventListener("pointermove", (事件) => {
      if (!按下) return;
      // mouse系合成移动不带pointerId时不同步清右键按下态，避免误清
      if (按下.按钮 === 2 && 事件.pointerType === "mouse" && 事件.buttons === 0) return;
      if (Math.hypot(事件.clientX - 按下.x, 事件.clientY - 按下.y) > 移动容差()) {
        按下 = null;
        清计时器();
      }
    });

    画布.addEventListener("mousemove", (事件) => {
      if (!按下 || 按下.按钮 !== 2) return;
      if (Math.hypot(事件.clientX - 按下.x, 事件.clientY - 按下.y) > 移动容差()) {
        按下 = null;
        清计时器();
      }
    });

    画布.addEventListener("pointerup", (事件) => {
      if (!按下) return;
      const 是右键单击 = 按下.按钮 === 2 && Math.hypot(事件.clientX - 按下.x, 事件.clientY - 按下.y) <= 移动容差();
      按下 = null;
      清计时器();
      if (是右键单击) this.戳一下(事件.clientX, 事件.clientY);
    });

    // 与mousedown配对：合成右键走这条触发标注
    画布.addEventListener("mouseup", (事件) => {
      if (事件.button !== 2) return;
      右键松开(事件.clientX, 事件.clientY);
    });

    画布.addEventListener("pointercancel", () => {
      按下 = null;
      清计时器();
    });

    // 最终兜底：contextmenu一定会在右键松开时派发，避免各系事件缺失导致链路断裂
    画布.addEventListener("contextmenu", (事件) => {
      事件.preventDefault();
      const x = 事件.clientX ?? 按下?.x ?? window.innerWidth / 2;
      const y = 事件.clientY ?? 按下?.y ?? window.innerHeight / 2;
      右键松开(x, y);
    });
  }

  /** @returns {boolean} 有没有戳中模型 */
  戳一下(屏幕x, 屏幕y) {
    const 归一化 = 屏幕转归一化(屏幕x, 屏幕y, this.舞台.画布);
    const 命中 = this.模型.命中(归一化, this.舞台.相机);
    if (!命中) return false;

    const 部位 = this.取部位(命中.点);
    const 屏幕 = 世界转客户端(命中.点, this.舞台.相机, this.舞台.画布);
    this.贴标签(屏幕.x, 屏幕.y, 随机取(配置.标注.吐槽池[部位]));
    发布("标注", { 部位 });
    return true;
  }

  /** 按命中点在模型高度的位置分成头 / 上半身 / 下半身 */
  取部位(点) {
    const 盒 = this.模型.包围盒;
    const 高度 = Math.max(1e-4, 盒.max.y - 盒.min.y);
    const 比例 = (点.y - 盒.min.y) / 高度;
    if (比例 >= 配置.标注.头部比例) return "头";
    if (比例 < 配置.标注.下半身比例) return "下半身";
    return "上半身";
  }

  贴标签(x, y, 文本) {
    const 标签 = document.createElement("div");
    标签.className = "标注签";
    标签.textContent = 文本;
    标签.style.left = `${x}px`;
    标签.style.top = `${y}px`;
    标签.style.setProperty("--tilt", `${随机整数(-6, 6)}deg`);
    this.层.appendChild(标签);
    setTimeout(() => 标签.remove(), 配置.标注.存活秒 * 1000);
  }
}
