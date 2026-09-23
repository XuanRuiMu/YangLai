import * as THREE from "three";
import { 配置 } from "./config.js";

const 夹 = (值, 最小, 最大) => Math.min(最大, Math.max(最小, 值));
const 阻尼插值 = (当前, 目标, 系数, 步长) => 当前 + (目标 - 当前) * (1 - Math.exp(-系数 * 步长));

/**
 * 动作系统：把「未上色分割模型」(12 个刚体部件) 分析成 头/身体/左右臂/左右腿 六个枢轴，
 * 每帧按当前动作程序化求值并应用变换。阳来·分离 = 把部件沿径向炸开。
 *
 * 设计要点：
 *  - 部件在装配前（场景单位变换）分析，关节/爆炸方向都用「模型原生坐标」，装配只负责整体缩放旋转平移。
 *  - 肢体绕枢轴旋转（绕 X = 前后摆，绕 Y = 左右转/摇头，绕 Z = 侧举/屈臂）。
 *  - 分离时各部件沿爆炸方向平移，枢轴回到静止，避免肢体旋转污染炸开效果。
 */
export class 动作系统 {
  constructor(场景, 舞台) {
    this.场景 = 场景;
    this.舞台 = 舞台;
    this.部件 = []; // { 网格, 类型, 静息本地坐标, 爆炸方向, 爆炸距离 }
    this.枢轴 = {};
    this.当前动作 = null;
    this.循环 = false;
    this.进入时间 = 0;
    this.相位 = 0;
    this.分离因子 = 0;
    this.身体基座Y = 0;
    this.基地 = { y: 0, 旋转Y: 0 };
    this.就绪 = false;
  }

  /** 装配前（场景单位变换）分析部件、建枢轴、上材质 */
  分析() {
    const 场景 = this.场景;
    场景.updateMatrixWorld(true);

    const 全部盒 = new THREE.Box3().setFromObject(场景);
    const 中心 = 全部盒.getCenter(new THREE.Vector3());

    const 网格列表 = [];
    场景.traverse((o) => {
      if (o.isMesh) {
        o.geometry.computeBoundingBox();
        const 盒 = new THREE.Box3().setFromObject(o);
        const 局部 = 盒.getCenter(new THREE.Vector3());
        网格列表.push({
          网格: o,
          中心: 局部,
          尺寸: 盒.getSize(new THREE.Vector3()),
          顶: 盒.max.y,
          底: 盒.min.y,
        });
      }
    });

    // 分类：居中=身体；高处偏移=手臂；低处偏移=腿；最高身体件单独做头枢轴
    const 参数 = 配置.动作.分析参数 || {};
    const 横向 = 参数.居中横向 ?? 0.07;
    const 纵深 = 参数.居中纵深 ?? 0.08;
    let 最高身体件 = null;
    for (const m of 网格列表) {
      const 居中X = Math.abs(m.中心.x - 中心.x) < 横向 && Math.abs(m.中心.z - 中心.z) < 纵深;
      if (居中X) {
        if (!最高身体件 || m.顶 > 最高身体件.顶) 最高身体件 = m;
      }
    }
    for (const m of 网格列表) {
      const 居中X = Math.abs(m.中心.x - 中心.x) < 横向 && Math.abs(m.中心.z - 中心.z) < 纵深;
      let 类型;
      if (居中X) {
        类型 = m === 最高身体件 ? "头" : "身体";
      } else if (m.中心.y > (参数.高处分界 ?? 0.5)) {
        类型 = m.中心.x > 0 ? "右臂" : "左臂";
      } else {
        类型 = m.中心.x > 0 ? "右腿" : "左腿";
      }
      m.类型 = 类型;
    }

    // 计算各枢轴关节位置（原生坐标）
    const 关节 = (类型, 默认) => {
      const 同组 = 网格列表.filter((m) => m.类型 === 类型);
      if (!同组.length) return 默认;
      if (类型 === "头") {
        const 脖 = 最高身体件.底 + (最高身体件.顶 - 最高身体件.底) * (参数.头颈比例 ?? 0.06);
        return new THREE.Vector3(最高身体件.中心.x, 脖, 最高身体件.中心.z);
      }
      if (类型 === "身体") {
        return new THREE.Vector3(0, 参数.身体关节高 ?? 0.46, 0);
      }
      // 手臂：肩在最高件顶端；腿：髋在固定高度
      const 顶Y = Math.max(...同组.map((m) => m.顶));
      const 平均X = 同组.reduce((s, m) => s + m.中心.x, 0) / 同组.length;
      const 平均Z = 同组.reduce((s, m) => s + m.中心.z, 0) / 同组.length;
      const y = 类型.includes("臂") ? 顶Y : (参数.腿关节高 ?? 0.46);
      return new THREE.Vector3(平均X, y, 平均Z);
    };

    const 建枢轴 = (名, 位置) => {
      const g = new THREE.Group();
      g.name = "枢轴_" + 名;
      g.position.copy(位置);
      场景.add(g);
      this.枢轴[名] = g;
      return g;
    };
    建枢轴("头", 关节("头"));
    建枢轴("身体", 关节("身体"));
    建枢轴("右臂", 关节("右臂"));
    建枢轴("左臂", 关节("左臂"));
    建枢轴("右腿", 关节("右腿"));
    建枢轴("左腿", 关节("左腿"));
    this.身体基座Y = this.枢轴.身体.position.y;

    // 上材质：动作模型自带 COLOR_0 顶点色，用「白色基底 + vertexColors」让顶点色透出来。
    // 原本统一涂成陶土会把动作该有的颜色抹掉——这正是"做动作时模型没颜色"的根因。
    // 顶点色走线性空间，白色基底只做乘性着色，冻结(偏蓝)/暴怒(偏红)的 tint 也照常生效。
    const 顶点色材质 = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02,
      vertexColors: true,
      flatShading: false,
    });
    this.顶点色材质 = 顶点色材质;
    const 枢轴名映射 = { 头: "头", 身体: "身体", 右臂: "右臂", 左臂: "左臂", 右腿: "右腿", 左腿: "左腿" };

    for (const m of 网格列表) {
      const 网格 = m.网格;
      网格.material = 顶点色材质;
      网格.castShadow = true;
      网格.receiveShadow = true;

      const 枢轴 = this.枢轴[枢轴名映射[m.类型]];
      场景.updateMatrixWorld(true);
      // attach 保留世界变换，把部件挂到对应枢轴下；之后本地坐标即相对关节
      枢轴.attach(网格);

      const 静息本地坐标 = 网格.position.clone();
      复用爆炸方向.copy(m.中心).sub(中心);
      if (复用爆炸方向.lengthSq() < 1e-6) 复用爆炸方向.set(0, 1, 0);
      复用爆炸方向.normalize();
      const 距离 = m.中心.distanceTo(中心);
      this.部件.push({
        网格,
        类型: m.类型,
        静息本地坐标,
        爆炸方向: 复用爆炸方向.clone(),
        爆炸距离: 0.16 + 距离 * 配置.动作.分离距离,
      });
    }

    this.基地 = { y: 场景.position.y, 旋转Y: 场景.rotation.y };
    this.就绪 = true;
  }

  /**
   * 在分割模型「装配」（归一化缩放 / 朝向偏移）之后再调用一次：
   * 重建 idle 基准，否则更新时场景 position.y / rotation.y 会被打回 0。
   */
  同步基地() {
    if (!this.场景) return;
    this.基地 = { y: this.场景.position.y, 旋转Y: this.场景.rotation.y };
  }

  /** 开始播放某动作（名=null 表示回到静止） */
  播放(名) {
    this.当前动作 = 名;
    this.循环 = 配置.动作.列表.some((a) => a.id === 名 && a.循环) || 名 === "阳来";
    this.进入时间 = 0;
    this.相位 = 0;
    this.已回待机 = false;
  }

  停止() {
    this.当前动作 = null;
    this.循环 = false;
    this.相位 = 0;
    this.已回待机 = false;
  }

  /** 每帧调用 */
  更新(步长) {
    if (!this.就绪) return;
    let 有名 = !!this.当前动作;
    if (有名) {
      this.进入时间 += 步长;
      const 上限 = 取周期上限(this.当前动作);
      this.相位 = this.循环 ? (this.相位 + 步长) % 上限 : Math.min(this.相位 + 步长, 上限);
      if (!this.循环 && !this.已回待机) {
        const 时长 = 取单次时长(this.当前动作);
        if (this.进入时间 >= 时长) {
          this.已回待机 = true;
          this.当前动作 = null;
          this.相位 = 0;
          有名 = false;
        }
      }
    }

    const 姿态 = 有名 ? 求姿态(this.当前动作, this.相位) : 静止姿态();
    const 分离目标 = 姿态.分离;
    this.分离因子 = 阻尼插值(this.分离因子, 分离目标, 5, 步长);
    // 非分离动作淡入，避免切换瞬移
    const 幅度 = 有名 && 分离目标 < 0.5 ? 夹(this.进入时间 / 0.3, 0, 1) : 1;
    const 动作权重 = (1 - this.分离因子) * 幅度;

    const 设枢轴 = (名, r) => {
      const g = this.枢轴[名];
      g.rotation.set(r.x * 动作权重, r.y * 动作权重, r.z * 动作权重);
    };
    设枢轴("头", 姿态.头);
    设枢轴("右臂", 姿态.右臂);
    设枢轴("左臂", 姿态.左臂);
    设枢轴("右腿", 姿态.右腿);
    设枢轴("左腿", 姿态.左腿);

    const 身体 = this.枢轴.身体;
    身体.rotation.set(姿态.身体.x * 动作权重, 姿态.身体.y * 动作权重, 姿态.身体.z * 动作权重);
    身体.position.y = this.身体基座Y + 姿态.身体.posY * (1 - this.分离因子);

    // 整体抬升（跳）/ 自转（旋转/阳来）
    this.场景.position.y = this.基地.y + 姿态.跳偏移 * (1 - this.分离因子);
    this.场景.rotation.y = this.基地.旋转Y + 姿态.自旋 * (1 - this.分离因子);

    // 分离：各部件沿径向炸开
    if (this.分离因子 > 0.0005) {
      for (const 部件 of this.部件) {
        部件.网格.position.copy(部件.静息本地坐标).addScaledVector(部件.爆炸方向, this.分离因子 * 部件.爆炸距离);
      }
    } else {
      for (const 部件 of this.部件) 部件.网格.position.copy(部件.静息本地坐标);
    }
  }
}

/* ── 姿态求值：返回各枢轴旋转(弧度) + 身体.posY + 跳偏移 + 自旋 + 分离 ── */

const 复用爆炸方向 = new THREE.Vector3();

function 取单次时长(名) {
  const 表 = 配置.动作.单次时长秒 || {};
  return 表[名] ?? 表.默认 ?? 1.2;
}

function 取周期上限(名) {
  const 表 = 配置.动作.周期秒 || {};
  return 表[名] ?? 表.默认 ?? 6.283185;
}

function 静止姿态() {
  return {
    头: { x: 0, y: 0, z: 0 },
    身体: { x: 0, y: 0, z: 0, posY: 0 },
    右臂: { x: 0, y: 0, z: 0 },
    左臂: { x: 0, y: 0, z: 0 },
    右腿: { x: 0, y: 0, z: 0 },
    左腿: { x: 0, y: 0, z: 0 },
    跳偏移: 0,
    自旋: 0,
    分离: 0,
  };
}

function 求姿态(名, t) {
  const p = 静止姿态();
  const TAU = Math.PI * 2;
  switch (名) {
    case "走": {
      const 周期 = (配置.动作.周期秒 || {}).走 ?? 1.1, a = (TAU * t) / 周期, A = 0.5, B = 0.32;
      p.右腿.x = Math.sin(a) * A;
      p.左腿.x = -Math.sin(a) * A;
      p.右臂.x = -Math.sin(a) * B;
      p.左臂.x = Math.sin(a) * B;
      p.身体.posY = Math.abs(Math.sin(a)) * 0.03;
      p.身体.x = 0.04;
      break;
    }
    case "跑": {
      const 周期 = (配置.动作.周期秒 || {}).跑 ?? 0.62, a = (TAU * t) / 周期, A = 0.95, B = 0.72;
      p.右腿.x = Math.sin(a) * A;
      p.左腿.x = -Math.sin(a) * A;
      p.右臂.x = -Math.sin(a) * B;
      p.左臂.x = Math.sin(a) * B;
      p.右臂.z = 0.5;
      p.左臂.z = 0.5;
      p.身体.posY = Math.abs(Math.sin(a)) * 0.06;
      p.身体.x = 0.22;
      break;
    }
    case "跳": {
      const D = 取单次时长("跳"), u = 夹(t, 0, D) / D;
      let 腿弯 = 0, 身沉 = 0, 升 = 0, 臂上 = 0;
      if (u < 0.18) { const k = u / 0.18; 腿弯 = 0.5 * k; 身沉 = 0.06 * k; 臂上 = -0.6 * k; }
      else if (u < 0.4) { const k = (u - 0.18) / 0.22; 腿弯 = 0.5 * (1 - k); 身沉 = 0.06 * (1 - k); 升 = Math.sin(k * Math.PI / 2) * 0.55; 臂上 = -0.6 + 1.8 * k; }
      else if (u < 0.62) { 升 = 0.55; 臂上 = 1.2; }
      else if (u < 0.82) { const k = (u - 0.62) / 0.2; 升 = 0.55 * (1 - k); 腿弯 = 0.5 * k; 身沉 = 0.06 * k; 臂上 = 1.2 * (1 - k); }
      else { const k = (u - 0.82) / 0.18; 腿弯 = 0.5 * k; 身沉 = 0.06 * k; }
      p.右腿.x = -腿弯; p.左腿.x = -腿弯;
      p.身体.posY = -身沉 + 升;
      p.右臂.x = 臂上; p.左臂.x = 臂上;
      p.跳偏移 = 升;
      p.身体.x = 升 * 0.1;
      break;
    }
    case "挥手": {
      p.右臂.x = -1.5 + Math.sin(t * 7) * 0.35;
      p.右臂.z = -0.2;
      p.左臂.x = -0.25;
      p.身体.x = 0.03;
      break;
    }
    case "点头": {
      p.头.x = Math.sin(t * 4) * 0.35;
      break;
    }
    case "摇头": {
      p.头.y = Math.sin(t * 5) * 0.4;
      break;
    }
    case "鞠躬": {
      const D = 取单次时长("鞠躬"), u = 夹(t, 0, D) / D;
      let 倾;
      if (u < 0.35) 倾 = 0.5 * (u / 0.35);
      else if (u < 0.7) 倾 = 0.5;
      else 倾 = 0.5 * (1 - (u - 0.7) / 0.3);
      p.身体.x = 倾;
      p.头.x = 倾 * 0.4;
      break;
    }
    case "鼓掌": {
      const s = Math.sin(t * 10) * 0.15;
      p.右臂.x = -1.3 + s;
      p.左臂.x = -1.3 - s;
      p.右臂.z = -0.7;
      p.左臂.z = 0.7;
      p.身体.x = 0.05;
      break;
    }
    case "欢呼": {
      p.右臂.x = -2.2 + Math.sin(t * 4) * 0.2;
      p.左臂.x = -2.2 - Math.sin(t * 4) * 0.2;
      p.身体.posY = Math.abs(Math.sin(t * 4)) * 0.04;
      break;
    }
    case "蹲下": {
      p.右腿.x = -0.7;
      p.左腿.x = -0.7;
      p.身体.posY = -0.12;
      p.身体.x = 0.06;
      break;
    }
    case "踢腿": {
      const D = 取单次时长("踢腿"), u = 夹(t, 0, D) / D;
      const k = u < 0.3 ? u / 0.3 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      p.右腿.x = -1.4 * k;
      p.身体.x = 0.1;
      p.左腿.x = 0.1;
      p.右臂.x = -0.3;
      break;
    }
    case "出拳": {
      const D = 取单次时长("出拳"), u = 夹(t, 0, D) / D;
      const k = u < 0.3 ? u / 0.3 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      p.右臂.x = -1.3 * k;
      p.右臂.z = 0.1 * k;
      p.身体.y = -0.18 * k;
      p.左臂.x = -0.2;
      break;
    }
    case "跳舞": {
      const a = t * 3;
      p.身体.x = Math.sin(a) * 0.15;
      p.身体.y = Math.sin(a * 2) * 0.2;
      p.右臂.x = -1.0 + Math.sin(a) * 0.5;
      p.左臂.x = -1.0 - Math.sin(a) * 0.5;
      p.身体.posY = Math.abs(Math.sin(a)) * 0.05;
      break;
    }
    case "旋转": {
      p.自旋 = t * 2.2;
      p.右臂.x = -0.3;
      p.左臂.x = -0.3;
      p.右臂.z = -0.4;
      p.左臂.z = 0.4;
      break;
    }
    case "比心": {
      p.右臂.x = -1.6;
      p.左臂.x = -1.6;
      p.右臂.z = -0.85;
      p.左臂.z = 0.85;
      p.头.x = 0.1;
      break;
    }
    case "生气": {
      p.身体.y = Math.sin(t * 12) * 0.12;
      p.身体.x = -0.08;
      p.右臂.x = -0.4;
      p.左臂.x = -0.4;
      p.右臂.z = 0.5;
      p.左臂.z = -0.5;
      p.头.y = Math.sin(t * 12) * 0.1;
      break;
    }
    case "害怕": {
      p.身体.posY = Math.abs(Math.sin(t * 14)) * 0.02 + Math.sin(t * 22) * 0.01;
      p.右臂.x = -0.8;
      p.左臂.x = -0.8;
      p.右臂.z = 0.7;
      p.左臂.z = -0.7;
      p.头.x = Math.sin(t * 16) * 0.12;
      break;
    }
    case "大笑": {
      p.身体.posY = Math.abs(Math.sin(t * 8)) * 0.06;
      p.右臂.x = -1.0;
      p.左臂.x = -1.0;
      p.右臂.z = 0.6;
      p.左臂.z = -0.6;
      p.头.x = Math.sin(t * 8) * 0.1;
      break;
    }
    case "坐下": {
      p.右腿.x = -1.1;
      p.左腿.x = -1.1;
      p.身体.posY = -0.35;
      p.身体.x = 0.12;
      p.右臂.x = -0.2;
      p.左臂.x = -0.2;
      break;
    }
    case "躺下": {
      p.身体.x = 1.3;
      p.身体.posY = -0.4;
      p.右腿.x = -0.3;
      p.左腿.x = -0.3;
      break;
    }
    case "伸展": {
      const D = 取单次时长("伸展"), u = 夹(t, 0, D) / D;
      const k = u < 0.4 ? u / 0.4 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      p.右臂.x = -2.4 * k;
      p.左臂.x = -2.4 * k;
      p.身体.x = -0.12 * k;
      p.头.x = -0.1 * k;
      break;
    }
    case "敬礼": {
      p.右臂.x = -2.3;
      p.右臂.z = 0.3;
      p.右臂.y = -0.2;
      p.头.x = 0.1;
      p.左臂.x = -0.2;
      break;
    }
    case "阳来": {
      p.分离 = 1;
      p.自旋 = t * 0.4;
      p.身体.posY = Math.sin(t * 1.2) * 0.03;
      break;
    }
    default:
      break;
  }
  return p;
}
