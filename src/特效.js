import * as THREE from "three";
import { 配置, 随机取 } from "./配置.js";
import { 取表情纹理, 随机, 随机整数 } from "./工具.js";
import { 声音 } from "./音频.js";
import { 发布 } from "./事件.js";

/** 会在模型表面乱爬一阵的小东西 */
class 爬行物 {
  constructor(中心, 半径, 场景, 表情 = "🕷️") {
    this.中心 = 中心.clone();
    this.半径 = 半径.clone();
    this.方向 = new THREE.Vector3(随机(-1, 1), 随机(-0.2, 0.9), 随机(-1, 1)).normalize();
    this.目标方向 = this.方向.clone();
    this.寿命 = 随机(3.5, 5.5);
    this.已活 = 0;
    this.换目标 = 0;

    this.精灵 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: 取表情纹理(表情),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      })
    );
    this.精灵.scale.setScalar(0.09);
    场景.add(this.精灵);
    this.场景 = 场景;
  }

  更新(步长) {
    this.已活 += 步长;
    this.换目标 -= 步长;
    if (this.换目标 <= 0) {
      this.目标方向.copy(this.方向).add(复用抖动.set(随机(-0.7, 0.7), 随机(-0.25, 0.25), 随机(-0.7, 0.7))).normalize();
      this.换目标 = 随机(0.5, 1.3);
    }
    this.方向.lerp(this.目标方向, Math.min(1, 步长 * 2.2)).normalize();

    复用爬行位置.set(
      this.中心.x + this.半径.x * this.方向.x * 1.04,
      this.中心.y + this.半径.y * this.方向.y * 1.04,
      this.中心.z + this.半径.z * this.方向.z * 1.04
    );
    // 走一步抖一下，显得是"爬"
    复用爬行位置.y += Math.sin(this.已活 * 22) * 0.006;
    this.精灵.position.copy(复用爬行位置);

    const 淡入 = Math.min(1, this.已活 * 4);
    const 淡出 = Math.min(1, Math.max(0, this.寿命 - this.已活) * 2);
    this.精灵.material.opacity = Math.min(淡入, 淡出);

    return this.已活 >= this.寿命;
  }

  销毁() {
    this.场景.remove(this.精灵);
    this.精灵.material.dispose();
  }
}

/** 冲击波圆环 */
class 冲击波 {
  constructor(位置, 法线, 场景, 颜色 = 配置.颜色.爆炸.冲击波) {
    this.生命 = 0;
    this.时长 = 0.55;
    this.网格 = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.05, 40),
      new THREE.MeshBasicMaterial({ color: 颜色, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    this.网格.position.copy(位置).addScaledVector(法线, 0.01);
    this.网格.lookAt(临时点.copy(位置).addScaledVector(法线, 1));
    场景.add(this.网格);
    this.场景 = 场景;
  }

  更新(步长) {
    this.生命 += 步长;
    const t = this.生命 / this.时长;
    this.网格.scale.setScalar(1 + t * 14);
    this.网格.material.opacity = Math.max(0, 0.9 * (1 - t));
    return this.生命 >= this.时长;
  }

  销毁() {
    this.场景.remove(this.网格);
    this.网格.geometry.dispose();
    this.网格.material.dispose();
  }
}

export class 特效系统 {
  constructor({ 舞台, 模型, 粒子, 污渍 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.粒子 = 粒子;
    this.污渍 = 污渍;
    this.爬行物 = [];
    this.冲击波 = [];
    this.金币雨剩余 = 0;
    this.金币雨计时 = 0;
    this.番茄雨剩余 = 0;
    this.番茄雨计时 = 0;
    this.太羊雨剩余 = 0;
    this.太羊雨计时 = 0;
  }

  /** 按道具配置里的特效名触发 */
  触发(特效名, 上下文) {
    const { 点, 法线, 道具 } = 上下文;
    switch (特效名) {
      case "金币雨":
        this.金币雨剩余 = 46;
        this.金币雨计时 = 0;
        声音.播放("叮咚", 1.15);
        发布("提示", { 文本: 配置.文案.金币雨 });
        break;

      case "烟花":
        this.放烟花(点);
        break;

      case "冻结":
        this.模型.冻结(配置.演出.冻结时长秒);
        发布("提示", { 文本: 配置.文案.冻结 });
        发布("台词", { 文本: 随机取(配置.台词.冻住) });
        break;

      case "毒气云":
        this.粒子.云团({ 位置: 点, 颜色: 道具.溅色, 数量: 40, 半径: 配置.粒子.毒气半径, 上升: 0.42, 寿命: 3.8, 尺寸: 0.16 });
        发布("提示", { 文本: 配置.文案.毒气 });
        break;

      case "清洗":
        this.清洗(点);
        break;

      case "爆炸":
        this.爆炸(点, 法线);
        break;

      case "升空":
        this.升空();
        break;

      case "火箭":
        this.放火箭();
        break;

      case "喇叭":
        this.放喇叭(点, 法线);
        break;

      case "爬行":
        this.放爬虫(3);
        break;

      case "滑倒":
        this.滑倒();
        break;

      case "重击":
        this.舞台.震一下(16);
        this.模型.挨打(法线, 1.8);
        发布("提示", { 文本: 配置.文案.重击 });
        break;

      case "蜡烛":
        this.点蜡烛(点);
        break;

      default:
        break;
    }
  }

  放烟花(中心) {
    if (this.烟花计时?.length) for (const 计时 of this.烟花计时) clearTimeout(计时);
    this.烟花计时 = [];
    const 基x = 中心.x;
    const 基y = 中心.y;
    const 基z = 中心.z;
    const 波数 = 随机整数(3, 5);
    for (let i = 0; i < 波数; i++) {
      this.烟花计时.push(setTimeout(() => {
        复用位置.set(基x + 随机(-0.35, 0.35), 基y + 随机(0.1, 0.8), 基z + 随机(-0.35, 0.35));
        this.粒子.爆发({
          位置: 复用位置,
          样式: "烟花",
          颜色: 配置.颜色.烟花[随机整数(0, 配置.颜色.烟花.length - 1)],
          数量: 30,
          强度: 1.2,
        });
        声音.播放("鞭炮", 随机(0.85, 1.2));
      }, i * 130));
    }
    this.舞台.震一下(7);
  }

  /** 火箭：全屏一道轨迹 + 震屏 + 主播被吹得往上飘 */
  放火箭() {
    if (this.火箭计时?.length) for (const 计时 of this.火箭计时) clearTimeout(计时);
    if (this.火箭元素) {
      this.火箭元素.remove();
      this.火箭元素 = null;
    }
    this.火箭计时 = [];
    this.舞台.震一下(18);
    this.模型.受宠(1.2);
    this.模型.位移速度.y = Math.min(this.模型.位移速度.y + 3.2, 配置.特效.垂直速度上限);
    const 盒 = this.模型.包围盒;
    for (let i = 0; i < 3; i++) {
      this.火箭计时.push(setTimeout(() => {
        复用位置.set(随机(盒.min.x, 盒.max.x), 随机(盒.min.y, 盒.max.y), 随机(盒.min.z, 盒.max.z));
        this.粒子.爆发({
          位置: 复用位置,
          样式: "火花",
          颜色: 配置.颜色.火箭,
          数量: 30,
          强度: 1.2,
        });
      }, i * 260));
    }
    this.飞一把火箭();
    发布("提示", { 文本: 配置.文案.火箭 });
    发布("台词", { 文本: 随机取(配置.礼物.主播回应池), 强制: true });
    声音.播放("升空", 1.12);
  }

  飞一把火箭() {
    const 箭头 = document.createElement("div");
    箭头.className = "火箭飞";
    箭头.textContent = "🚀";
    箭头.style.setProperty("--时长", `${配置.特效.火箭飞行秒}s`);
    箭头.style.setProperty("--起", 配置.特效.火箭轨迹[0]);
    箭头.style.setProperty("--中", 配置.特效.火箭轨迹[1]);
    箭头.style.setProperty("--止", 配置.特效.火箭轨迹[2]);
    document.body.appendChild(箭头);
    this.火箭元素 = 箭头;
    setTimeout(() => {
      if (this.火箭元素 === 箭头) this.火箭元素 = null;
      箭头.remove();
    }, 配置.特效.火箭飞行秒 * 1000 + 400);
  }

  /** 喇叭：弹幕被瞬间刷屏，主播捂耳 */
  放喇叭(点, 法线) {
    this.舞台.震一下(8);
    const 安全法线 = 法线 || 复用法线;
    const 安全点 = 点 || 复用中心.copy(this.模型.中心);
    this.模型.挨打(安全法线, 1.1);
    this.粒子.爆发({ 位置: 安全点, 法线: 安全法线, 样式: "烟尘", 颜色: 配置.颜色.喇叭, 数量: 26, 强度: 1.1 });
    发布("喇叭");
    发布("提示", { 文本: 配置.文案.喇叭 });
    发布("台词", { 文本: "耳朵！我的耳朵！", 强制: true });
  }

  清洗(点) {
    if (this.清洗计时?.length) for (const 计时 of this.清洗计时) clearTimeout(计时);
    this.清洗计时 = [];
    this.污渍.清空();
    this.粒子.云团({ 位置: 点, 颜色: 配置.颜色.清洗.主色, 数量: 46, 半径: 0.8, 上升: 0.75, 寿命: 2.2, 尺寸: 0.17 });
    for (let i = 0; i < 5; i++) {
      this.清洗计时.push(setTimeout(() => {
        const 盒 = this.模型.包围盒;
        复用位置.set(随机(盒.min.x, 盒.max.x), 随机(盒.min.y, 盒.max.y), 随机(盒.min.z, 盒.max.z));
        this.粒子.云团({
          位置: 复用位置,
          颜色: 配置.颜色.清洗.副色,
          数量: 14,
          半径: 0.4,
          上升: 0.5,
          寿命: 1.6,
          尺寸: 0.13,
        });
      }, i * 90));
    }
    发布("提示", { 文本: 配置.文案.清洗完成 });
    发布("台词", { 文本: 随机取(配置.台词.清洗) });
  }

  爆炸(点, 法线) {
    const 安全法线 = 法线 || 复用法线;
    this.粒子.爆发({ 位置: 点, 法线: 安全法线, 样式: "火花", 颜色: 配置.颜色.爆炸.火花, 数量: 70, 强度: 1.6 });
    this.粒子.爆发({ 位置: 点, 法线: 安全法线, 样式: "烟尘", 颜色: 配置.颜色.爆炸.烟尘, 数量: 34, 强度: 1.1 });
    this.粒子.爆发({ 位置: 点, 法线: 安全法线, 样式: "碎片", 颜色: 配置.颜色.爆炸.碎片, 数量: 26, 强度: 1.3 });
    this.冲击波.push(new 冲击波(点, 安全法线, this.舞台.场景, 配置.颜色.爆炸.冲击波));
    this.舞台.震一下(22);
    this.模型.挨打(安全法线, 2.4);
    发布("提示", { 文本: 配置.文案.爆炸 });
  }

  升空() {
    this.模型.位移速度.y = Math.min(this.模型.位移速度.y + 6.5, 配置.特效.垂直速度上限);
    this.模型.扭转速度.x += 5;
    this.舞台.震一下(12);
    this.粒子.爆发({
      位置: 临时点.set(this.模型.中心.x, this.模型.包围盒.min.y, this.模型.中心.z),
      法线: 复用下法线,
      样式: "火花",
      颜色: 配置.颜色.升空,
      数量: 46,
      强度: 1.4,
    });
    发布("提示", { 文本: 配置.文案.升空 });
  }

  点蜡烛(点) {
    复用上偏移.copy(点);
    复用上偏移.y += 0.1;
    this.粒子.爆发({ 位置: 点, 样式: "火花", 颜色: 配置.颜色.蜡烛.火光, 数量: 26, 强度: 0.7 });
    this.粒子.云团({ 位置: 复用上偏移, 颜色: 配置.颜色.蜡烛.光晕, 数量: 12, 半径: 0.12, 上升: 0.9, 寿命: 1.6, 尺寸: 0.05, 发光: true });
    this.模型.受宠(0.6);
  }

  滑倒() {
    this.模型.扭转速度.x += 9;
    this.舞台.震一下(9);
    发布("提示", { 文本: 配置.文案.滑倒 });
  }

  放爬虫(数量 = 3) {
    const 上限 = 配置.特效.爬行上限;
    const 可加 = Math.max(0, 上限 - this.爬行物.length);
    const 实际 = Math.min(数量, 可加);
    if (实际 <= 0) return;
    const 盒 = this.模型.包围盒;
    盒.getCenter(复用中心);
    盒.getSize(复用半径);
    复用半径.multiplyScalar(0.5);
    for (let i = 0; i < 实际; i++) {
      const 虫 = new 爬行物(复用中心, 复用半径, this.舞台.场景);
      this.爬行物.push(虫);
    }
    发布("提示", { 文本: 配置.文案.爬行 });
  }

  更新(步长) {
    for (let i = this.爬行物.length - 1; i >= 0; i--) {
      if (this.爬行物[i].更新(步长)) {
        this.爬行物[i].销毁();
        this.爬行物.splice(i, 1);
      }
    }

    for (let i = this.冲击波.length - 1; i >= 0; i--) {
      if (this.冲击波[i].更新(步长)) {
        this.冲击波[i].销毁();
        this.冲击波.splice(i, 1);
      }
    }

    if (this.金币雨剩余 > 0) {
      this.金币雨计时 -= 步长;
      if (this.金币雨计时 <= 0) {
        this.金币雨计时 = 0.045;
        const 批 = Math.min(4, this.金币雨剩余);
        const 盒 = this.模型.包围盒;
        for (let i = 0; i < 批; i++) {
          复用位置.set(
            随机(盒.min.x - 0.35, 盒.max.x + 0.35),
            盒.max.y + 随机(0.35, 1.1),
            随机(盒.min.z - 0.35, 盒.max.z + 0.35)
          );
          复用方向.set(随机(-0.2, 0.2), -1, 随机(-0.2, 0.2)).normalize();
          this.粒子.爆发({
            位置: 复用位置,
            法线: 复用方向,
            样式: "金币",
            颜色: 配置.颜色.金币雨,
            数量: 2,
            强度: 0.35,
          });
        }
        this.金币雨剩余 -= 批;
      }
    }

    if (this.番茄雨剩余 > 0) {
      this.番茄雨剩余 -= 步长;
      this.番茄雨计时 -= 步长;
      if (this.番茄雨计时 <= 0) {
        this.番茄雨计时 = 1 / 配置.番茄雨.每秒颗数;
        const 盒 = this.模型.包围盒;
        复用位置.set(
          随机(盒.min.x - 0.8, 盒.max.x + 0.8),
          盒.max.y + 随机(1.2, 2.4),
          随机(盒.min.z - 0.8, 盒.max.z + 0.8)
        );
        复用方向.set(随机(-0.2, 0.2), -1, 随机(-0.2, 0.2)).normalize();
        this.粒子.爆发({
          位置: 复用位置,
          法线: 复用方向,
          样式: "液体",
          颜色: 配置.颜色.番茄雨,
          数量: 6,
          强度: 0.55,
        });
      }
    }

    if (this.太羊雨剩余 > 0) {
      this.太羊雨剩余 -= 步长;
      this.太羊雨计时 -= 步长;
      if (this.太羊雨计时 <= 0) {
        this.太羊雨计时 = 1 / 配置.太羊雨.每秒批次数;
        const 盒 = this.模型.包围盒;
        复用位置.set(随机(盒.min.x - 0.6, 盒.max.x + 0.6), 盒.max.y + 随机(0.4, 1.6), 随机(盒.min.z - 0.6, 盒.max.z + 0.6));
        复用方向.set(随机(-0.4, 0.4), 0.2, 随机(-0.4, 0.4)).normalize();
        this.粒子.爆发({
          位置: 复用位置,
          法线: 复用方向,
          样式: "星光",
          颜色: 配置.颜色.太羊雨,
          数量: 4,
          强度: 0.4,
        });
      }
    }
  }

  开始番茄雨() {
    this.番茄雨剩余 = 配置.番茄雨.持续秒;
    this.舞台.震一下(10);
    发布("提示", { 文本: 配置.文案.番茄雨 });
    同步验收探针雨(this);
  }

  开始太羊雨() {
    this.太羊雨剩余 = 配置.太羊雨.持续秒;
    this.舞台.震一下(6);
    发布("提示", { 文本: 配置.文案.太羊雨 });
    同步验收探针雨(this);
  }

  清空() {
    for (const 虫 of this.爬行物) 虫.销毁();
    for (const 波 of this.冲击波) 波.销毁();
    for (const 计时 of [...(this.烟花计时 || []), ...(this.火箭计时 || []), ...(this.清洗计时 || [])]) {
      clearTimeout(计时);
    }
    if (this.火箭元素) {
      this.火箭元素.remove();
      this.火箭元素 = null;
    }
    this.烟花计时 = [];
    this.火箭计时 = [];
    this.清洗计时 = [];
    this.爬行物.length = 0;
    this.冲击波.length = 0;
    this.金币雨剩余 = 0;
    this.番茄雨剩余 = 0;
    this.太羊雨剩余 = 0;
  }
}

const 临时点 = new THREE.Vector3();
const 复用法线 = new THREE.Vector3(0, 1, 0);
const 复用下法线 = new THREE.Vector3(0, -1, 0);
const 复用位置 = new THREE.Vector3();
const 复用方向 = new THREE.Vector3();
const 复用中心 = new THREE.Vector3();
const 复用半径 = new THREE.Vector3();
const 复用上偏移 = new THREE.Vector3();
const 复用抖动 = new THREE.Vector3();
const 复用爬行位置 = new THREE.Vector3();

function 同步验收探针雨(特效) {
  try {
    const 探针 = document.querySelector("#验收探针");
    if (!探针) return;
    探针.dataset.太羊雨剩余 = String(特效.太羊雨剩余 ?? 0);
    探针.dataset.番茄雨剩余 = String(特效.番茄雨剩余 ?? 0);
  } catch {
  }
}
