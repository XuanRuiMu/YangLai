import * as THREE from "three";
import { 配置 } from "./配置.js";
import { 取表情纹理, 随机, 夹取 } from "./工具.js";
import { 发布, 订阅 } from "./事件.js";

const 飞行参数 = {
  投送: { 秒: 配置.投掷.投送飞行秒, 弧度: 配置.投掷.投送弧度, 尺寸: 0.17 },
  投掷: { 秒: 配置.投掷.投掷飞行秒, 弧度: 配置.投掷.投掷弧度, 尺寸: 0.15 },
  佩戴: { 秒: 配置.投掷.佩戴飞行秒, 弧度: 配置.投掷.佩戴弧度, 尺寸: 0.15 },
};

/** 一枚正在飞行中的道具 */
class 飞行道具 {
  constructor(道具, 起点, 终点, 场景) {
    this.道具 = 道具;
    this.起点 = 起点.clone();
    this.终点 = 终点.clone();
    const 参数 = 飞行参数[道具.分类] || 飞行参数.投掷;

    this.时长 = 参数.秒 * 随机(0.92, 1.08);
    this.进度 = 0;
    this.尺寸 = 参数.尺寸;
    this.自转 = 随机(-1, 1) * 配置.投掷.自转速度;

    // 控制点抬高，做出抛物线的弧
    const 中点 = this.起点.clone().lerp(this.终点, 0.5);
    const 距离 = this.起点.distanceTo(this.终点);
    this.控制点 = 中点.add(new THREE.Vector3(随机(-0.1, 0.1) * 距离, 距离 * 参数.弧度 + 0.12, 随机(-0.1, 0.1) * 距离));

    this.精灵 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: 取表情纹理(道具.emoji),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      })
    );
    this.精灵.scale.setScalar(this.尺寸);
    this.精灵.position.copy(this.起点);
    this.精灵.renderOrder = 10;
    场景.add(this.精灵);
    this.场景 = 场景;
  }

  更新(步长) {
    this.进度 = Math.min(1, this.进度 + 步长 / this.时长);
    const t = this.进度;
    const 反 = 1 - t;

    // 二次贝塞尔
    this.精灵.position.set(
      反 * 反 * this.起点.x + 2 * 反 * t * this.控制点.x + t * t * this.终点.x,
      反 * 反 * this.起点.y + 2 * 反 * t * this.控制点.y + t * t * this.终点.y,
      反 * 反 * this.起点.z + 2 * 反 * t * this.控制点.z + t * t * this.终点.z
    );

    // 先弹出再收拢一点，飞行更有"抛"的感觉
    const 缩放曲线 = t < 0.18 ? t / 0.18 : 1;
    this.精灵.scale.setScalar(this.尺寸 * (0.55 + 0.45 * 缩放曲线));
    this.精灵.material.rotation += this.自转 * 步长;
    this.精灵.material.opacity = t > 0.9 ? (1 - t) * 10 : 1;

    return this.进度 >= 1;
  }

  销毁() {
    this.场景.remove(this.精灵);
    this.精灵.material.dispose();
  }
}

/** 落在模型身上的道具本体 */
class 放置物 {
  constructor(道具, 点, 法线, 父容器) {
    this.道具 = 道具;
    this.基准点 = 点.clone().addScaledVector(法线, 配置.放置物.悬浮高度);
    this.法线 = 法线.clone();
    this.生命 = 0;
    this.相位 = Math.random() * Math.PI * 2;
    this.淡出 = 0;

    this.精灵 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: 取表情纹理(道具.emoji),
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        opacity: 0,
      })
    );
    const 尺寸 = 道具.分类 === "佩戴" ? 0.2 : 道具.分类 === "投掷" ? 0.13 : 0.17;
    this.尺寸 = 尺寸;
    this.精灵.scale.setScalar(1e-4);
    this.精灵.position.copy(this.基准点);
    this.精灵.renderOrder = 8;
    父容器.add(this.精灵);
    this.父容器 = 父容器;
  }

  更新(步长, 时间) {
    if (this.淡出 > 0) {
      this.淡出 = Math.max(0, this.淡出 - 步长);
      const 比例 = this.淡出 / 1;
      this.精灵.material.opacity = 比例;
      this.精灵.scale.setScalar(this.尺寸 * (1 + (1 - 比例) * 0.6));
      return this.淡出 <= 0;
    }

    this.生命 += 步长;
    if (配置.放置物.存活秒 > 0 && this.生命 >= 配置.放置物.存活秒) {
      this.开始淡出();
    }
    // 出现时弹一下，之后轻微浮动
    const 弹出 = Math.min(1, this.生命 * 5);
    const 弹跳 = 1 + Math.sin(Math.min(Math.PI, this.生命 * 12)) * 0.22 * (1 - 弹出 * 0.6);
    const 浮动 = Math.sin(时间 * 1.8 + this.相位) * 0.006;
    this.精灵.scale.setScalar(this.尺寸 * 弹出 * 弹跳);
    this.精灵.material.opacity = 弹出;
    this.精灵.position.copy(this.基准点).addScaledVector(this.法线, 浮动);
    return false;
  }

  开始淡出() {
    if (this.淡出 > 0) return;
    this.淡出 = 1;
  }

  销毁() {
    this.父容器.remove(this.精灵);
    this.精灵.material.dispose();
  }
}

export class 道具系统 {
  constructor({ 舞台, 模型, 粒子, 污渍 }) {
    this.舞台 = 舞台;
    this.模型 = 模型;
    this.粒子 = 粒子;
    this.污渍 = 污渍;

    this.飞行中 = [];
    this.放置物 = [];
    this.淡出中 = [];
    this.地面香蕉皮 = [];
    this.香蕉冷却 = 0;

    // 拖拽时的瞄准圈
    this.瞄准圈 = this.造瞄准圈();
    舞台.场景.add(this.瞄准圈);
    this.瞄准圈.visible = false;

    // 一键清洗时地上的香蕉皮也要跟着没
    订阅("清洗", () => this.清空香蕉皮());
  }

  造瞄准圈() {
    const 组 = new THREE.Group();
    const 环 = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.072, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false })
    );
    const 芯 = new THREE.Mesh(
      new THREE.CircleGeometry(0.016, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false })
    );
    组.add(环, 芯);
    组.renderOrder = 20;
    return 组;
  }

  显示瞄准(命中) {
    if (!命中) {
      this.瞄准圈.visible = false;
      return;
    }
    this.瞄准圈.visible = true;
    this.瞄准圈.position.copy(命中.点).addScaledVector(命中.法线, 0.008);
    this.瞄准圈.lookAt(临时点.copy(命中.点).addScaledVector(命中.法线, 1));
  }

  隐藏瞄准() {
    this.瞄准圈.visible = false;
  }

  /**
   * 发射一枚道具
   * @returns {object} { 成功, 是否兜底 } YH-014/YH-018根因：超限false不结算，兜底命中区分真实未命中
   */
  发射(道具, 屏幕坐标) {
    if (this.飞行中.length >= 配置.投掷.飞行上限) return { 成功: false, 是否兜底: false };

    const 直中 = this.模型.命中(屏幕坐标, this.舞台.相机);
    const 兜底 = 直中 ? null : this.模型.兜底命中点(屏幕坐标, this.舞台.相机);
    const 命中 = 直中 || 兜底;

    // 从镜头前方甩出去，像是观众扔的
    const 方向 = 命中.点.clone().sub(this.舞台.相机.position).normalize();
    const 起点 = this.舞台.相机.position
      .clone()
      .addScaledVector(方向, 配置.投掷.出手偏移)
      .add(new THREE.Vector3(随机(-配置.投掷.抖动系数, 配置.投掷.抖动系数), 随机(-0.22, 0.02), 0));

    const 飞行 = new 飞行道具(道具, 起点, 命中.点, this.舞台.场景);
    this.飞行中.push({ 飞行, 命中, 道具, 是否兜底: !直中 });
    return { 成功: true, 是否兜底: !直中 };
  }

  /** 轰炸模式下直接空投到模型各处 */
  空投(道具) {
    const 盒 = this.模型.包围盒;
    const 目标 = new THREE.Vector3(
      随机(盒.min.x, 盒.max.x),
      随机(盒.min.y + (盒.max.y - 盒.min.y) * 0.25, 盒.max.y),
      随机(盒.min.z, 盒.max.z)
    );
    const 命中 = { 点: 目标, 法线: new THREE.Vector3(随机(-1, 1), 随机(0.2, 1), 随机(-1, 1)).normalize() };
    const 起点 = 目标.clone().add(new THREE.Vector3(随机(-0.6, 0.6), 随机(2.4, 3.6), 随机(-0.6, 0.6)));
    const 飞行 = new 飞行道具(道具, 起点, 目标, this.舞台.场景);
    this.飞行中.push({ 飞行, 命中, 道具, 是否兜底: false });
    return { 成功: true, 是否兜底: false };
  }

  更新(步长, 时间) {
    for (let i = this.飞行中.length - 1; i >= 0; i--) {
      const 项 = this.飞行中[i];
      const 结束 = 项.飞行.更新(步长);
      if (!结束) continue;
      this.命中处理(项.道具, 项.命中);
      项.飞行.销毁();
      this.飞行中.splice(i, 1);
    }

    for (let i = this.放置物.length - 1; i >= 0; i--) {
      const 物 = this.放置物[i];
      if (物.更新(步长, 时间)) {
        物.销毁();
        this.放置物.splice(i, 1);
      }
    }

    for (let i = this.淡出中.length - 1; i >= 0; i--) {
      const 物 = this.淡出中[i];
      if (物.更新(步长, 时间)) {
        物.销毁();
        this.淡出中.splice(i, 1);
      }
    }

    this.更新香蕉皮(步长, 时间);
  }

  命中处理(道具, 命中) {
    const { 点, 法线 } = 命中;

    // 溅渍
    if (道具.留渍) {
      const 片数 = 道具.粒子样式 === "液体" ? 3 : 2;
      for (let i = 0; i < 片数; i++) {
        const 抖 = new THREE.Vector3(随机(-0.05, 0.05), 随机(-0.05, 0.05), 随机(-0.05, 0.05));
        this.污渍.添加({ 点: 点.clone().add(抖), 法线, 颜色: 道具.溅色 });
      }
    }

    // 粒子
    this.粒子.爆发({
      位置: 点,
      法线,
      样式: 道具.粒子样式,
      颜色: 道具.溅色,
      数量: 道具.粒子数,
      强度: 道具.分类 === "投掷" ? 1.15 : 0.85,
    });

    // 留下道具本体（香蕉皮改走地面残留，避免粘脸上又掉地上重复）
    if (道具.放置 && 道具.id !== "香蕉皮") {
      this.加放置物(道具, 点, 法线);
    }

    if (道具.id === "香蕉皮" && Math.random() < 配置.香蕉皮.残留概率) {
      this.丢地面香蕉皮(点, 道具);
    }

    发布("道具命中", { 道具, 点, 法线 });
  }

  丢地面香蕉皮(点, 道具) {
    if (this.地面香蕉皮.length >= 配置.香蕉皮.地面上限) {
      const 淘汰 = this.地面香蕉皮.shift();
      this.舞台.场景.remove(淘汰.精灵);
      淘汰.精灵.material.dispose();
    }
    const 落点 = new THREE.Vector3(点.x + 随机(-0.35, 0.35), 0.04, 点.z + 随机(-0.35, 0.35));
    const 精灵 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: 取表情纹理(道具.emoji),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    精灵.scale.set(0.16, 0.1, 1);
    精灵.position.copy(落点);
    精灵.material.rotation = 随机(-0.6, 0.6);
    this.舞台.场景.add(精灵);
    this.地面香蕉皮.push({ 精灵, 相位: Math.random() * 6, 剩余秒: 配置.香蕉皮.地面存活秒 });
    发布("提示", { 文本: 配置.文案.香蕉残留 });
  }

  更新香蕉皮(步长, 时间) {
    this.香蕉冷却 = Math.max(0, this.香蕉冷却 - 步长);
    const 模型点 = this.模型.容器.position;
    const 心x = this.模型.中心.x + 模型点.x;
    const 心z = this.模型.中心.z + 模型点.z;

    for (let i = this.地面香蕉皮.length - 1; i >= 0; i--) {
      const 皮 = this.地面香蕉皮[i];
      皮.剩余秒 -= 步长;
      if (皮.剩余秒 <= 0) {
        this.舞台.场景.remove(皮.精灵);
        皮.精灵.material.dispose();
        this.地面香蕉皮.splice(i, 1);
        continue;
      }
      皮.精灵.position.y = 0.04 + Math.sin(时间 * 2 + 皮.相位) * 0.006;
    }

    if (this.香蕉冷却 > 0 || !this.地面香蕉皮.length) return;
    for (const 皮 of this.地面香蕉皮) {
      const dx = 皮.精灵.position.x - 心x;
      const dz = 皮.精灵.position.z - 心z;
      if (Math.hypot(dx, dz) < 配置.香蕉皮.滑倒距离) {
        this.香蕉冷却 = 配置.香蕉皮.滑倒冷却秒;
        发布("香蕉滑倒");
        break;
      }
    }
  }

  清空香蕉皮() {
    for (const 皮 of this.地面香蕉皮) {
      this.舞台.场景.remove(皮.精灵);
      皮.精灵.material.dispose();
    }
    this.地面香蕉皮.length = 0;
  }

  加放置物(道具, 点, 法线) {
    const 存活 = this.放置物.filter((物) => 物.淡出 <= 0);
    if (存活.length >= 配置.放置物.最大数量) {
      const 淘汰 = 存活[0];
      淘汰.开始淡出();
      const 索引 = this.放置物.indexOf(淘汰);
      if (索引 >= 0) this.放置物.splice(索引, 1);
      this.淡出中.push(淘汰);
    }
    this.放置物.push(new 放置物(道具, 点, 法线, this.模型.容器));
  }

  清空放置物() {
    for (const 物 of this.放置物) 物.销毁();
    for (const 物 of this.淡出中) 物.销毁();
    this.放置物.length = 0;
    this.淡出中.length = 0;
    this.清空香蕉皮();
  }

  清空飞行() {
    for (const 项 of this.飞行中) 项.飞行.销毁();
    this.飞行中.length = 0;
  }

  get 飞行数量() {
    return this.飞行中.length;
  }
}

const 临时点 = new THREE.Vector3();
