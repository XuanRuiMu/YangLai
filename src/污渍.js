import * as THREE from "three";
import { 配置 } from "./配置.js";
import { 取溅渍纹理, 随机, 夹取 } from "./工具.js";
import { 发布 } from "./事件.js";

const 变体数 = 5;

/**
 * 污渍：贴着模型表面法线的小贴片。
 * 用预分配的对象池，最多 配置.污渍.最大数量 片，超了就把最老的淡出回收。
 */
export class 污渍管理 {
  constructor(父容器) {
    this.父容器 = 父容器;
    this.池 = [];
    this.活跃 = [];
    this.序号 = 0;

    const 几何 = new THREE.PlaneGeometry(1, 1);
    this.几何 = 几何;
    for (let i = 0; i < 配置.污渍.最大数量; i++) {
      const 材质 = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.FrontSide,
        toneMapped: false,
      });
      const 网格 = new THREE.Mesh(几何, 材质);
      网格.visible = false;
      网格.renderOrder = 3;
      网格.frustumCulled = false;
      父容器.add(网格);
      this.池.push({ 网格, 材质, 在用: false, 淡出: 0, 出现: 0 });
    }
  }

  /** 取一个空槽；没有就把最老的那片开始淡出后复用 */
  取槽() {
    for (const 槽 of this.池) if (!槽.在用 && 槽.淡出 <= 0) return 槽;
    let 最老 = null;
    for (const 槽 of this.池) {
      if (槽.淡出 > 0) continue;
      if (!最老 || 槽.序号 < 最老.序号) 最老 = 槽;
    }
    if (最老) {
      最老.在用 = false;
      最老.淡出 = 配置.污渍.淡出秒;
      最老.网格.visible = true;
      const 旧索引 = this.活跃.indexOf(最老);
      if (旧索引 >= 0) this.活跃.splice(旧索引, 1);
    }
    return 最老;
  }

  添加({ 点, 法线, 颜色 = "#e23b2e", 尺寸倍率 = 1 }) {
    const 槽 = this.取槽();
    if (!槽) return null;

    const 尺寸 = (配置.污渍.基础尺寸 + 随机(-配置.污渍.尺寸抖动, 配置.污渍.尺寸抖动)) * 尺寸倍率;
    const 变体 = Math.floor(Math.random() * 变体数);

    槽.在用 = true;
    槽.淡出 = 0;
    槽.出现 = 0;
    槽.序号 = ++this.序号;
    槽.基础透明度 = 随机(0.72, 0.95);
    槽.材质.map = 取溅渍纹理(变体);
    槽.材质.color.set(颜色);
    槽.材质.opacity = 0;

    槽.网格.scale.setScalar(尺寸);
    槽.网格.position.copy(点).addScaledVector(法线, 配置.污渍.贴合偏移);
    槽.网格.lookAt(临时点.copy(点).addScaledVector(法线, 1));
    槽.网格.rotateZ(Math.random() * Math.PI * 2);
    槽.网格.visible = true;

    this.活跃.push(槽);
    发布("污渍变化", { 数量: this.数量 });
    return 槽;
  }

  更新(步长) {
    for (let i = this.活跃.length - 1; i >= 0; i--) {
      const 槽 = this.活跃[i];

      if (槽.出现 < 1) {
        槽.出现 = Math.min(1, 槽.出现 + 步长 * 8);
        槽.材质.opacity = 槽.基础透明度 * 槽.出现;
      }

      if (槽.淡出 > 0) {
        槽.淡出 = Math.max(0, 槽.淡出 - 步长);
        const 比例 = 槽.淡出 / 配置.污渍.淡出秒;
        槽.材质.opacity = 槽.基础透明度 * 比例;
        槽.网格.scale.multiplyScalar(1 + 步长 * 0.6);
        if (槽.淡出 === 0) {
          槽.在用 = false;
          槽.网格.visible = false;
          槽.材质.opacity = 0;
          this.活跃.splice(i, 1);
        }
      }
    }
  }

  /** 一键清洗：标记所有污渍淡出 */
  清空() {
    for (const 槽 of this.活跃) {
      if (槽.在用) {
        槽.在用 = false;
        槽.淡出 = 配置.污渍.淡出秒;
      }
    }
  }

  get 数量() {
    let 数 = 0;
    for (const 槽 of this.活跃) if (槽.在用) 数++;
    return 数;
  }
}

const 临时点 = new THREE.Vector3();
