import * as THREE from "three";
import { 配置, 随机取 } from "./配置.js";
import { 随机, 随机整数, 世界转客户端, 屏幕转归一化, 格式化数字 } from "./工具.js";
import { 声音 } from "./音频.js";
import { 发布 } from "./事件.js";

/**
 * 双击点赞：
 * - 双击模型表面 → 点赞图标从命中点飘起来，连击加分
 * - 双击空处也给分，但少一点
 */
export class 点赞系统 {
  constructor({ 舞台, 模型, 粒子, 层 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.粒子 = 粒子;
    this.层 = 层;

    this.总数 = 0;
    this.连击 = 0;
    this.里程碑序号 = 0;
    this.上次点击 = null;
    this.上次连击时间 = 0;
    this.按下位置 = null;
    this.是否拖动 = false;
    this.浮动元素 = new Set();

    this.绑定();
  }

  绑定() {
    const 画布 = this.舞台.画布;
    画布.addEventListener("pointerdown", (事件) => {
      this.按下位置 = { x: 事件.clientX, y: 事件.clientY };
      this.是否拖动 = false;
    });
    画布.addEventListener("pointermove", (事件) => {
      if (!this.按下位置) return;
      const 距离 = Math.hypot(事件.clientX - this.按下位置.x, 事件.clientY - this.按下位置.y);
      if (距离 > 配置.手势.拖拽判定像素) this.是否拖动 = true;
    });
    画布.addEventListener("pointerup", (事件) => {
      const 起点 = this.按下位置;
      this.按下位置 = null;
      if (!起点 || this.是否拖动) return;
      this.处理点击(事件.clientX, 事件.clientY);
    });
    // 手动判定已覆盖触屏；这里只压掉桌面端原生双击带来的选中/缩放副作用
    画布.addEventListener("dblclick", (事件) => 事件.preventDefault());
  }

  处理点击(x, y) {
    const 现在 = performance.now();
    const 上次 = this.上次点击;
    this.上次点击 = { x, y, 时间: 现在 };

    const 够快 = 上次 && 现在 - 上次.时间 <= 配置.点赞.双击间隔毫秒;
    const 够近 = 上次 && Math.hypot(x - 上次.x, y - 上次.y) <= 配置.手势.双击判定像素;
    if (!够快 || !够近) {
      this.单击计时 && clearTimeout(this.单击计时);
      const 点击x = x, 点击y = y;
      this.单击计时 = setTimeout(() => {
        if (this.上次点击 && this.上次点击.x === 点击x && this.上次点击.y === 点击y) {
          this.上次点击 = null;
          this.单击反馈(点击x, 点击y);
        }
      }, 配置.点赞.单击反馈延迟毫秒);
      return;
    }

    // 双击成立，清掉单击计时避免误判
    this.单击计时 && clearTimeout(this.单击计时);
    this.单击计时 = null;
    this.上次点击 = null;
    this.点赞(x, y);
  }

  单击反馈(屏幕x, 屏幕y) {
    const 归一化 = 屏幕转归一化(屏幕x, 屏幕y, this.舞台.画布);
    const 命中 = this.模型.命中(归一化, this.舞台.相机);
    const 图标 = 随机取(配置.点赞.单击反馈图标);
    if (命中) {
      const 屏幕 = 世界转客户端(命中.点, this.舞台.相机, this.舞台.画布);
      this.飘一个(图标, 屏幕.x, 屏幕.y, 配置.点赞.单击图标倍率);
      this.粒子.爆发({
        位置: 命中.点,
        法线: 命中.法线,
        样式: "星光",
        颜色: 配置.颜色.点赞星光,
        数量: 配置.点赞.单击粒子数,
        强度: 0.4,
      });
    } else {
      this.飘一个(图标, 屏幕x, 屏幕y, 配置.点赞.单击图标倍率);
    }
    声音.播放音阶(0);
  }

  点赞(屏幕x, 屏幕y) {
    const 归一化 = 屏幕转归一化(屏幕x, 屏幕y, this.舞台.画布);
    const 命中 = this.模型.命中(归一化, this.舞台.相机);

    const 现在 = performance.now();
    const 连击延续 = 现在 - this.上次连击时间 <= 配置.点赞.连击窗口毫秒;
    this.连击 = 连击延续 ? this.连击 + 1 : 1;
    this.上次连击时间 = 现在;

    const 得分 = 命中 ? 配置.点赞.命中加分 : 配置.点赞.空处加分;
    this.总数 += 得分;

    const 图标 = 随机取(配置.点赞.图标池);
    if (命中) {
      const 屏幕 = 世界转客户端(命中.点, this.舞台.相机, this.舞台.画布);
      this.飘一个(图标, 屏幕.x, 屏幕.y, 命中 ? 1.15 : 1);
      this.粒子.爆发({
        位置: 命中.点,
        法线: 命中.法线,
        样式: "星光",
        颜色: "#ff6fa5",
        数量: 命中 ? 10 : 6,
        强度: 0.7,
      });
      this.模型.受宠(0.5);
    } else {
      this.飘一个(图标, 屏幕x, 屏幕y, 1);
    }

    声音.播放音阶(this.连击 - 1);
    声音.播放("点赞");

    // 连击里程碑
    const 里程碑 = 配置.点赞.连击里程碑[this.里程碑序号];
    if (里程碑 && this.连击 >= 里程碑) {
      this.里程碑序号++;
      this.放里程碑特效(里程碑, 命中);
    }

    发布("点赞", {
      总数: this.总数,
      连击: this.连击,
      命中: !!命中,
      得分,
      好感增量: 命中 ? 1 : 0,
      远程: false,
    });

    if (this.连击 > 1) 发布("连击", { 连击: this.连击 });
  }

  接收远程(增量) {
    const 原始 = Number(增量);
    if (!Number.isFinite(原始) || 原始 <= 0) return;
    const 加 = Math.min(Math.floor(原始), 配置.安全.远程点赞单次上限);
    if (!加) return;
    this.总数 += 加;
    发布("点赞", { 总数: this.总数, 连击: this.连击, 命中: false, 得分: 加, 好感增量: 0, 远程: true });
  }

  飘一个(图标, x, y, 倍率 = 1) {
    const 元素 = document.createElement("div");
    元素.className = "点赞浮";
    元素.textContent = 图标;
    元素.style.left = `${x}px`;
    元素.style.top = `${y}px`;
    元素.style.setProperty("--dx", `${随机(-配置.点赞.点赞图标散布像素, 配置.点赞.点赞图标散布像素)}px`);
    元素.style.setProperty("--dy", `${-配置.点赞.点赞图标上升像素 * 倍率 * 随机(0.85, 1.15)}px`);
    元素.style.setProperty("--dr", `${随机(-45, 45)}deg`);
    元素.style.setProperty("--时长", `${配置.点赞.点赞图标存活毫秒}ms`);
    元素.style.fontSize = `${随机整数(...配置.点赞.点赞图标字号) * 倍率}px`;
    this.层.appendChild(元素);
    this.浮动元素.add(元素);

    const 清理 = () => {
      元素.remove();
      this.浮动元素.delete(元素);
    };
    元素.addEventListener("animationend", 清理, { once: true });
    setTimeout(清理, 配置.点赞.点赞图标存活毫秒 + 400);
  }

  放里程碑特效(里程碑, 命中) {
    声音.播放("里程碑");
    声音.播放("掌声");
    发布("提示", { 文本: 配置.文案.连击里程碑.replace("{里程碑}", 里程碑) });
    if (命中) {
      this.粒子.爆发({
        位置: 命中.点,
        法线: 命中.法线,
        样式: "烟花",
        颜色: "#ffd23f",
        数量: 44,
        强度: 1.3,
      });
    }
    const 盒 = this.模型.包围盒;
    for (let i = 0; i < 3; i++) {
      const 位置 = new THREE.Vector3(
        随机(盒.min.x, 盒.max.x),
        随机(盒.min.y + 0.2, 盒.max.y),
        随机(盒.min.z, 盒.max.z)
      );
      this.粒子.爆发({ 位置, 法线: new THREE.Vector3(0, 1, 0), 样式: "星光", 颜色: "#ffc53d", 数量: 20, 强度: 1 });
    }
    this.舞台.震一下(6);
  }

  /** 连击窗口过期后归零 */
  更新() {
    if (this.连击 > 0 && performance.now() - this.上次连击时间 > 配置.点赞.连击窗口毫秒) {
      this.连击 = 0;
      this.里程碑序号 = 0;
      this.上次点击 = null;
      this.单击计时 && clearTimeout(this.单击计时);
      this.单击计时 = null;
      发布("连击清零", { 连击: 0 });
      发布("连击", { 连击: 0 });
    }
  }

  get 显示总数() {
    return 格式化数字(this.总数);
  }
}
