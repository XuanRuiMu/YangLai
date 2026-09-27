import * as THREE from "three";
import { 配置 } from "./配置.js";
import { 取圆点纹理, 随机, 夹取 } from "./工具.js";

/** 每种粒子样式的物理参数 */
const 样式表 = {
  花瓣: { 寿命: 2.4, 重力: -0.5, 阻力: 1.6, 初速: 1.1, 扩散: 0.9, 尺寸: 0.055, 发光: false, 尺寸抖动: 0.5 },
  星光: { 寿命: 1.8, 重力: -0.3, 阻力: 2.2, 初速: 1.6, 扩散: 1, 尺寸: 0.05, 发光: true, 尺寸抖动: 0.6 },
  液体: { 寿命: 1.4, 重力: -3.2, 阻力: 0.9, 初速: 2.2, 扩散: 0.8, 尺寸: 0.045, 发光: false, 尺寸抖动: 0.7 },
  蛋壳: { 寿命: 1.6, 重力: -3, 阻力: 0.8, 初速: 1.9, 扩散: 0.9, 尺寸: 0.04, 发光: false, 尺寸抖动: 0.6 },
  碎片: { 寿命: 1.6, 重力: -3.4, 阻力: 0.7, 初速: 2.1, 扩散: 0.9, 尺寸: 0.038, 发光: false, 尺寸抖动: 0.7 },
  毒气: { 寿命: 3.6, 重力: 0.32, 阻力: 1.4, 初速: 0.55, 扩散: 1.2, 尺寸: 0.14, 发光: false, 尺寸抖动: 0.6 },
  烟花: { 寿命: 1.5, 重力: -1.1, 阻力: 1.5, 初速: 3.2, 扩散: 1, 尺寸: 0.05, 发光: true, 尺寸抖动: 0.7 },
  金币: { 寿命: 1.7, 重力: -3.8, 阻力: 0.5, 初速: 2.4, 扩散: 0.7, 尺寸: 0.05, 发光: true, 尺寸抖动: 0.4 },
  火花: { 寿命: 0.9, 重力: -1.6, 阻力: 1.8, 初速: 3.6, 扩散: 1, 尺寸: 0.035, 发光: true, 尺寸抖动: 0.8 },
  烟尘: { 寿命: 1.9, 重力: 0.12, 阻力: 1.9, 初速: 1.2, 扩散: 1.1, 尺寸: 0.11, 发光: false, 尺寸抖动: 0.7 },
  冰晶: { 寿命: 1.7, 重力: -1.2, 阻力: 1.2, 初速: 1.8, 扩散: 1, 尺寸: 0.045, 发光: true, 尺寸抖动: 0.6 },
};

/* 注意：GLSL 标识符只认 ASCII，着色器内部一律用英文名，JS 侧属性名也要对上 */
const 顶点着色器 = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (320.0 / max(0.001, -viewPos.z));
    gl_Position = projectionMatrix * viewPos;
  }
`;

const 片元着色器 = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.001) discard;
    vec4 tex = texture2D(uMap, gl_PointCoord);
    if (tex.a < 0.02) discard;
    gl_FragColor = vec4(vColor, tex.a * vAlpha);
  }
`;

class 粒子池 {
  constructor(上限, 发光) {
    this.上限 = 上限;
    this.数量 = 0;
    this.写指针 = 0;

    this.位置 = new Float32Array(上限 * 3);
    this.速度 = new Float32Array(上限 * 3);
    this.寿命 = new Float32Array(上限);
    this.总寿命 = new Float32Array(上限);
    this.重力 = new Float32Array(上限);
    this.阻力 = new Float32Array(上限);
    this.初始尺寸 = new Float32Array(上限);

    const 几何 = new THREE.BufferGeometry();
    this.属性位置 = new THREE.BufferAttribute(this.位置, 3).setUsage(THREE.DynamicDrawUsage);
    this.属性尺寸 = new THREE.BufferAttribute(new Float32Array(上限), 1).setUsage(THREE.DynamicDrawUsage);
    this.属性透明 = new THREE.BufferAttribute(new Float32Array(上限), 1).setUsage(THREE.DynamicDrawUsage);
    this.属性颜色 = new THREE.BufferAttribute(new Float32Array(上限 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    几何.setAttribute("position", this.属性位置);
    几何.setAttribute("aSize", this.属性尺寸);
    几何.setAttribute("aAlpha", this.属性透明);
    几何.setAttribute("aColor", this.属性颜色);
    几何.setDrawRange(0, 0);
    几何.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 50);

    this.材质 = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: 取圆点纹理() }, uPixelRatio: { value: 1 } },
      vertexShader: 顶点着色器,
      fragmentShader: 片元着色器,
      transparent: true,
      depthWrite: false,
      blending: 发光 ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.点 = new THREE.Points(几何, this.材质);
    this.点.frustumCulled = false;
    this.点.renderOrder = 5;
    this.几何 = 几何;
  }

  /** 找一个空槽位；池满了按ring-buffer顺序覆盖 */
  取槽位() {
    if (this.数量 < this.上限) return this.数量++;
    const 槽 = this.写指针;
    this.写指针 = (this.写指针 + 1) % this.上限;
    return 槽;
  }

  加(参数) {
    const i = this.取槽位();
    const { 位置, 速度, 寿命, 重力, 阻力, 尺寸, 颜色 } = 参数;
    this.位置[i * 3] = 位置.x;
    this.位置[i * 3 + 1] = 位置.y;
    this.位置[i * 3 + 2] = 位置.z;
    this.速度[i * 3] = 速度.x;
    this.速度[i * 3 + 1] = 速度.y;
    this.速度[i * 3 + 2] = 速度.z;
    this.寿命[i] = 寿命;
    this.总寿命[i] = 寿命;
    this.重力[i] = 重力;
    this.阻力[i] = 阻力;
    this.初始尺寸[i] = 尺寸;
    this.属性颜色.array[i * 3] = 颜色.r;
    this.属性颜色.array[i * 3 + 1] = 颜色.g;
    this.属性颜色.array[i * 3 + 2] = 颜色.b;
  }

  更新(步长) {
    const { 位置, 速度, 寿命, 总寿命, 重力, 阻力, 初始尺寸 } = this;
    const 尺寸数组 = this.属性尺寸.array;
    const 透明数组 = this.属性透明.array;

    for (let i = 0; i < this.数量; i++) {
      if (寿命[i] <= 0) {
        透明数组[i] = 0;
        尺寸数组[i] = 0;
        continue;
      }
      寿命[i] -= 步长;
      if (寿命[i] <= 0) {
        透明数组[i] = 0;
        尺寸数组[i] = 0;
        continue;
      }

      const 衰减 = Math.exp(-阻力[i] * 步长);
      速度[i * 3] *= 衰减;
      速度[i * 3 + 1] = (速度[i * 3 + 1] + 重力[i] * 步长) * 衰减;
      速度[i * 3 + 2] *= 衰减;

      位置[i * 3] += 速度[i * 3] * 步长;
      位置[i * 3 + 1] += 速度[i * 3 + 1] * 步长;
      位置[i * 3 + 2] += 速度[i * 3 + 2] * 步长;

      // 落到地板就贴地滑一下
      if (位置[i * 3 + 1] < 0.002 && 速度[i * 3 + 1] < 0) {
        位置[i * 3 + 1] = 0.002;
        速度[i * 3 + 1] *= -0.28;
        速度[i * 3] *= 0.6;
        速度[i * 3 + 2] *= 0.6;
      }

      const 进度 = 寿命[i] / 总寿命[i];
      透明数组[i] = 进度 > 0.75 ? (1 - 进度) * 4 : Math.min(1, 进度 * 2.6);
      尺寸数组[i] = 初始尺寸[i] * (0.55 + 进度 * 0.45);
    }

    this.几何.setDrawRange(0, this.数量);
    this.属性位置.needsUpdate = true;
    this.属性尺寸.needsUpdate = true;
    this.属性透明.needsUpdate = true;
    this.属性颜色.needsUpdate = true;
  }

  清空() {
    for (let i = 0; i < this.数量; i++) this.寿命[i] = 0;
    this.属性透明.array.fill(0);
    this.属性透明.needsUpdate = true;
  }
}

export class 粒子系统 {
  constructor(舞台) {
    const 上限 = 配置.粒子.总量上限;
    this.普通池 = new 粒子池(Math.floor(上限 * 0.6), false);
    this.发光池 = new 粒子池(Math.floor(上限 * 0.4), true);
    舞台.场景.add(this.普通池.点, this.发光池.点);
    this.系数 = 1;
    this.设置像素比(舞台.实际像素比 || 1);
  }

  /**
   * 爆发一簇粒子
   * @param {object} 选项 位置/法线/样式/颜色/数量/强度
   */
  爆发({ 位置, 法线, 样式 = "星光", 颜色 = "#ffffff", 数量 = 20, 强度 = 1 }) {
    const 安全法线 = 法线 || 复用法线;
    const 样式配置 = 样式表[样式] || 样式表.星光;
    const 池 = 样式配置.发光 ? this.发光池 : this.普通池;
    const 总数 = Math.max(1, Math.round(数量 * this.系数));
    复用基色.set(颜色);
    const 寿命基数 = 配置.粒子[`${样式}寿命秒`] ?? 样式配置.寿命;

    for (let i = 0; i < 总数; i++) {
      // 以法线为主轴的锥形喷射，混一点随机散射
      复用随机方向.set(随机(-1, 1), 随机(-1, 1), 随机(-1, 1)).normalize();
      复用方向.copy(安全法线).multiplyScalar(1 + 样式配置.扩散).addScaledVector(复用随机方向, 1).normalize();
      const 速率 = 样式配置.初速 * 随机(0.45, 1.35) * 强度;

      // 颜色做轻微抖动，避免一片死板的纯色
      复用色.copy(复用基色);
      const 抖动 = 随机(-0.12, 0.12);
      复用色.offsetHSL(随机(-0.02, 0.02), 随机(-0.08, 0.05), 抖动);

      复用位置.copy(位置).addScaledVector(复用方向, 随机(0, 0.04));
      复用方向.multiplyScalar(速率).addScaledVector(安全法线, 随机(0, 0.6) * 强度);

      池.加({
        位置: 复用位置,
        速度: 复用方向,
        寿命: 寿命基数 * 随机(0.7, 1.25),
        重力: 样式配置.重力 * 随机(0.8, 1.2),
        阻力: 样式配置.阻力,
        尺寸: 样式配置.尺寸 * 随机(1 - 样式配置.尺寸抖动 * 0.5, 1 + 样式配置.尺寸抖动),
        颜色: 复用色,
      });
    }
  }

  /** 简单上升气泡，毒气云/烟尘用 */
  云团({ 位置, 颜色, 数量 = 24, 半径 = 0.5, 上升 = 0.5, 寿命 = 3.6, 尺寸 = 0.14, 发光 = false }) {
    const 池 = 发光 ? this.发光池 : this.普通池;
    const 总数 = Math.max(1, Math.round(数量 * this.系数));
    复用基色.set(颜色);
    for (let i = 0; i < 总数; i++) {
      const 角 = Math.random() * Math.PI * 2;
      const 仰 = Math.acos(随机(-1, 1));
      const 距 = 半径 * Math.cbrt(Math.random());
      复用位置.set(
        位置.x + Math.sin(仰) * Math.cos(角) * 距,
        位置.y + Math.cos(仰) * 距 * 0.7,
        位置.z + Math.sin(仰) * Math.sin(角) * 距
      );
      复用方向.set(随机(-0.15, 0.15), 上升 * 随机(0.5, 1.3), 随机(-0.15, 0.15));
      复用色.copy(复用基色).offsetHSL(随机(-0.03, 0.03), 0, 随机(-0.08, 0.08));
      池.加({
        位置: 复用位置,
        速度: 复用方向,
        寿命: 寿命 * 随机(0.7, 1.3),
        重力: 0.05,
        阻力: 1.3,
        尺寸: 尺寸 * 随机(0.6, 1.5),
        颜色: 复用色,
      });
    }
  }

  更新(步长) {
    this.普通池.更新(步长);
    this.发光池.更新(步长);
  }

  清空() {
    this.普通池.清空();
    this.发光池.清空();
  }

  设置系数(系数) {
    this.系数 = 夹取(系数, 0.2, 1);
  }

  设置像素比(像素比) {
    this.普通池.材质.uniforms.uPixelRatio.value = 像素比;
    this.发光池.材质.uniforms.uPixelRatio.value = 像素比;
  }
}

const 复用法线 = new THREE.Vector3(0, 1, 0);
const 复用随机方向 = new THREE.Vector3();
const 复用方向 = new THREE.Vector3();
const 复用位置 = new THREE.Vector3();
const 复用基色 = new THREE.Color("#ffffff");
const 复用色 = new THREE.Color("#ffffff");
