import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { 配置 } from "./config.js";
import { 夹取, 随机, 缓入缓出 } from "./utils.js";
import { 发布 } from "./events.js";
import { 动作系统 } from "./动作.js";

const 目标身高 = 1.8;
const 临时盒 = new THREE.Box3();
const 临时尺寸 = new THREE.Vector3();
const 临时中心 = new THREE.Vector3();
const 临时缩放 = new THREE.Vector3();
const 复用命中法线 = new THREE.Vector3();
const 复用命中点 = new THREE.Vector3();
const 复用法线读取 = new THREE.Vector3();
const 复用上向量 = new THREE.Vector3(0, 1, 0);
const 复用中心读取 = new THREE.Vector3();

function 同步验收探针(模型) {
  try {
    const 探针 = document.querySelector("#验收探针");
    if (!探针) return;
    探针.dataset.在动作 = 模型.在动作 ? "1" : "0";
    探针.dataset.当前动作 = 模型.动作系统?.当前动作 || "";
    探针.dataset.分离因子 = String(模型.动作系统?.分离因子 ?? 0);
  } catch {
  }
}

class 加载状态机 {
  constructor(上报, 取权重) {
    this.上报 = 上报;
    this.取权重 = 取权重;
    this.主进度 = 0;
    this.部件进度 = 0;
    this.已发 = 0;
    this.说明 = "";
    this.完工 = false;
  }
  报主(比例, 说明) {
    if (this.完工) return;
    const 数值 = Number(比例);
    if (!Number.isFinite(数值)) return;
    this.主进度 = 夹取(数值, 0, 1);
    if (说明) this.说明 = 说明;
    this.推();
  }
  报部件(比例, 说明) {
    if (this.完工) return;
    const 数值 = Number(比例);
    if (!Number.isFinite(数值)) return;
    this.部件进度 = 夹取(数值, 0, 1);
    if (说明) this.说明 = 说明;
    this.推();
  }
  推() {
    const { 主权重, 部件权重, 取整 } = this.取权重();
    const 合计 = this.主进度 * 主权重 + this.部件进度 * 部件权重;
    const 值 = 取整 ? Math.round(合计 * 100) / 100 : 合计;
    const 单调 = Math.max(this.已发, 夹取(值, 0, 0.99));
    if (单调 <= this.已发) return;
    this.已发 = 单调;
    this.上报(this.已发, this.说明);
  }
  收尾(说明) {
    if (this.完工) return;
    this.完工 = true;
    this.已发 = 1;
    this.上报(1, 说明);
  }
}

function 读进度权重() {
  const 主权重 = Number(配置.模型?.主模型权重);
  const 部件权重 = Number(配置.模型?.部件模型权重);
  const 主 = Number.isFinite(主权重) && 主权重 >= 0 && 主权重 <= 1 ? 主权重 : 0.85;
  const 部 = Number.isFinite(部件权重) && 部件权重 >= 0 && 部件权重 <= 1 ? 部件权重 : 0.15;
  const 和 = 主 + 部;
  const 归一主 = 和 > 0 ? 主 / 和 : 1;
  return { 主权重: 归一主, 部件权重: 和 > 0 ? 部 / 和 : 0, 取整: 配置.模型?.进度取整 !== false };
}

export class 模型管理 {
  constructor(舞台) {
    this.舞台 = 舞台;
    this.容器 = new THREE.Group();
    舞台.场景.add(this.容器);
    this.模型 = null;
    this.包围盒 = new THREE.Box3();
    this.射线 = new THREE.Raycaster();

    // 受击回弹：位移弹簧 + 角度抖动
    this.位移弹簧 = new THREE.Vector3();
    this.位移速度 = new THREE.Vector3();
    this.扭转 = new THREE.Vector2();
    this.扭转速度 = new THREE.Vector2();
    this.缩放冲击 = 0;
    this.缩放冲击速度 = 0;
    this.冰冻 = 0;
    this.原始材质 = [];
    // 恶搞花活：蹦迪 / 倒立，单位秒，>0 时每帧叠加到容器上
    this.蹦迪剩余 = 0;
    this.倒立剩余 = 0;
    this.节拍 = 0;
    // 气跑：好感度砸穿后侧过身走出画面，三个阶段 走 → 待 → 回
    this.气跑阶段 = null;
    this.气跑剩余 = 0;
    this.气跑进度 = 0;

    // 双模型：着色模型（平时用，this.模型）与未上色分割模型（做动作时切到，this.部件模型）
    this.部件模型 = null;
    this.动作系统 = null;
    this.在动作 = false;
    this.部件加载中 = null;
    this.部件就绪 = false;
    this.待播动作 = null;
  }

  读加载器() {
    if (!this.共享加载器) {
      this.共享加载器 = new GLTFLoader();
      this.共享加载器.setMeshoptDecoder(MeshoptDecoder);
    }
    return this.共享加载器;
  }

  async 加载(进度回调) {
    const 验回调 = typeof 进度回调 === "function" ? 进度回调 : () => {};
    const 路径承诺 = 收集模型路径();
    const 状态机 = new 加载状态机(
      (比例, 说明) => 验回调(比例, 说明),
      读进度权重
    );
    const 部件承诺 = this.排队加载部件((比例, 说明) => 状态机.报部件(比例, 说明));
    const 路径列表 = await 路径承诺;
    const 主上报 = (比例, 说明) => 状态机.报主(比例, 说明);
    for (const 路径 of 路径列表) {
      for (let 尝试 = 0; 尝试 < 3; 尝试++) {
        try {
          const 结果 = await 载入模型(路径, this.读加载器(), 主上报);
          this.装配(结果.scene);
          状态机.报主(1, 配置.文案.加载就位);
          await 部件承诺;
          状态机.收尾(配置.文案.加载就位);
          return { 路径, 场景: 结果.scene };
        } catch {
          if (尝试 < 2) await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    this.装配(this.造fallback());
    return { 路径: "fallback", 场景: this.模型 };
  }

  排队加载部件(上报部件) {
    if (this.部件就绪 || this.部件加载中) return this.部件加载中;
    const 启动 = () => this.加载部件(上报部件);
    this.部件加载中 = new Promise((完成) => {
      const 踢 = () => 启动().then(完成, 完成);
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(踢, { timeout: 1500 });
      } else {
        setTimeout(踢, 0);
      }
    });
    return this.部件加载中;
  }

  确保部件() {
    if (this.部件就绪) return Promise.resolve(true);
    if (!this.部件加载中) this.排队加载部件();
    return this.部件加载中.then(() => this.部件就绪);
  }

  async 加载部件(上报部件) {
    const 路径 = 配置.动作.部件路径;
    try {
      const 结果 = await 载入模型(路径, this.读加载器(), (比例, 说明) => 上报部件?.(比例, `动作模型 ${说明}`));
      const 场景 = 结果.scene;
      this.容器.add(场景);
      场景.visible = false;
      this.部件模型 = 场景;
      // 此刻 scene 还是 glb 原生变换，世界坐标 == 本地坐标，分类 / 爆炸方向才准确
      场景.updateMatrixWorld(true);
      this.动作系统 = new 动作系统(场景, this.舞台);
      this.动作系统.分析();
      // 动作模型的顶点色材质也纳入 tint 体系，冻结 / 暴怒时和待机模型一起变色
      const 部件材质 = this.动作系统.顶点色材质;
      if (部件材质) {
        this.原始材质.push({
          材质: 部件材质,
          颜色: 部件材质.color.clone(),
          粗糙度: "roughness" in 部件材质 ? 部件材质.roughness : null,
          金属度: "metalness" in 部件材质 ? 部件材质.metalness : null,
        });
      }
      this.装配部件(场景);
      this.动作系统.同步基地();
      this.部件就绪 = true;
      发布("动作就绪");
      if (this.待播动作) {
        const 待播 = this.待播动作;
        this.待播动作 = null;
        this.播放动作(待播);
      }
    } catch {
      this.动作系统 = null;
      this.部件模型 = null;
      this.部件就绪 = false;
      this.部件加载中 = null;
    }
  }

  装配(场景) {
    this.模型 = 场景;

    // 归位：水平居中、脚底贴地、统一身高
    const 盒 = 临时盒.setFromObject(场景);
    盒.getSize(临时尺寸);
    盒.getCenter(临时中心);
    const 缩放 = 临时尺寸.y > 1e-4 ? 目标身高 / 临时尺寸.y : 1;
    // 朝向校准：绕模型自身的竖直中轴旋转，让正面机位见到模型正面
    const 朝向 = 配置.模型.朝向偏移 ?? 0;
    const 余 = Math.cos(朝向);
    const 正 = Math.sin(朝向);
    场景.rotation.y = 朝向;
    场景.scale.setScalar(缩放);
    场景.position.set(
      -(临时中心.x * 余 + 临时中心.z * 正) * 缩放,
      -盒.min.y * 缩放,
      (临时中心.x * 正 - 临时中心.z * 余) * 缩放
    );

    this.容器.add(场景);

    场景.traverse((对象) => {
      if (!对象.isMesh) return;
      对象.castShadow = true;
      对象.receiveShadow = true;
      const 材质 = 对象.material;
      if (!材质) return;
      const 列表 = Array.isArray(材质) ? 材质 : [材质];
      for (const m of 列表) {
        this.原始材质.push({
          材质: m,
          颜色: m.color ? m.color.clone() : null,
          粗糙度: "roughness" in m ? m.roughness : null,
          金属度: "metalness" in m ? m.metalness : null,
        });
        if (m.map) m.map.anisotropy = Math.min(8, this.舞台.渲染器.capabilities.getMaxAnisotropy());
        if ("envMapIntensity" in m) m.envMapIntensity = 0.9;
      }
    });

    this.容器.updateMatrixWorld(true);
    this.包围盒.setFromObject(场景);
    this.舞台.取景(this.包围盒);
  }

  /** 分割模型归一化：与着色模型同样的身高 / 朝向，保证切换时重叠 */
  装配部件(场景) {
    const 盒 = 临时盒.setFromObject(场景);
    盒.getSize(临时尺寸);
    盒.getCenter(临时中心);
    const 缩放 = 临时尺寸.y > 1e-4 ? 目标身高 / 临时尺寸.y : 1;
    const 朝向 = 配置.模型.朝向偏移 ?? 0;
    const 余 = Math.cos(朝向);
    const 正 = Math.sin(朝向);
    场景.rotation.y = 朝向;
    场景.scale.setScalar(缩放);
    场景.position.set(
      -(临时中心.x * 余 + 临时中心.z * 正) * 缩放,
      -盒.min.y * 缩放,
      (临时中心.x * 正 - 临时中心.z * 余) * 缩放
    );
    场景.traverse((对象) => {
      if (!对象.isMesh) return;
      对象.castShadow = true;
      对象.receiveShadow = true;
    });
  }

  造fallback() {
    const 组 = new THREE.Group();
    const 身体 = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x8866aa, roughness: 0.7 })
    );
    身体.position.y = 0.9;
    身体.castShadow = true;
    组.add(身体);
    const 头 = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xddc8a0, roughness: 0.6 })
    );
    头.position.y = 1.72;
    头.castShadow = true;
    组.add(头);
    return 组;
  }

  get 中心() {
    return this.包围盒.getCenter(复用中心读取);
  }

  get 高度() {
    return this.包围盒.max.y - this.包围盒.min.y;
  }

  /** 屏幕坐标 → 模型表面命中点（命中当前可见的模型） */
  命中(归一化坐标, 相机) {
    const 目标 = this.在动作 ? this.部件模型 : this.模型;
    if (!目标) return null;
    this.射线.setFromCamera(归一化坐标, 相机);
    this.射线.firstHitOnly = false;
    const 命中组 = this.射线.intersectObject(目标, true);
    if (!命中组.length) return null;
    const 命中 = 命中组[0];
    复用命中法线.copy(命中.face ? 复用法线读取.copy(命中.face.normal).transformDirection(命中.object.matrixWorld) : 复用上向量).normalize();
    复用命中点.copy(命中.point);
    return { 点: 复用命中点, 法线: 复用命中法线, 距离: 命中.distance, 对象: 命中.object };
  }

  /** 播放某个动作：切到分割模型；名=待机/空 则回到着色模型 */
  播放动作(名) {
    if (!名 || 名 === "待机") {
      this.停止动作();
      return;
    }
    if (!this.动作系统?.就绪) {
      this.待播动作 = 名;
      this.确保部件();
      发布("提示", { 文本: 配置.文案.动作加载中 });
      return;
    }
    this.在动作 = true;
    if (this.模型) this.模型.visible = false;
    if (this.部件模型) this.部件模型.visible = true;
    this.动作系统.播放(名);
    发布("动作", { 名 });
    同步验收探针(this);
  }

  /** 停止动作，回到着色模型 */
  停止动作() {
    this.在动作 = false;
    if (this.部件模型) this.部件模型.visible = false;
    if (this.模型) this.模型.visible = true;
    this.动作系统?.停止();
    发布("动作", { 名: "待机" });
    同步验收探针(this);
  }

  /** 模型包围盒上的近似命中点，射线没打中时兜底用 */
  兜底命中点(归一化坐标, 相机) {
    this.射线.setFromCamera(归一化坐标, 相机);
    const 射线 = this.射线.ray;
    临时中心.copy(this.包围盒.min).add(this.包围盒.max).multiplyScalar(0.5);
    临时缩放.set(0, 0, 0);
    if (射线.intersectBox(this.包围盒, 临时缩放)) {
      return { 点: 临时缩放.clone(), 法线: 临时缩放.clone().sub(临时中心).normalize() };
    }
    return { 点: 临时中心.clone(), 法线: new THREE.Vector3(0, 0, 1) };
  }

  /* ── 受击反馈 ─────────────────────────────── */

  /** 被砸时沿法线方向弹一下 + 轻微扭转 */
  挨打(方向, 强度 = 1) {
    const 力度 = 夹取(强度, 0.2, 3) * 0.02;
    this.位移速度.addScaledVector(方向, -力度 * 60);
    this.位移弹簧.y -= 力度 * 0.35;
    this.扭转速度.x += 随机(-0.9, 0.9) * 强度;
    this.扭转速度.y += 随机(-0.9, 0.9) * 强度;
    this.缩放冲击速度 -= 力度 * 9;
  }

  /** 被献花时轻轻晃一下 */
  受宠(强度 = 1) {
    this.扭转速度.x += 随机(-0.25, 0.25) * 强度;
    this.位移速度.y += 0.18 * 强度;
  }

  /** 蹦迪：自己扭起来 */
  蹦迪(秒 = 配置.恶搞.蹦迪持续秒) {
    this.蹦迪剩余 = 秒;
  }

  /** 停止蹦迪 */
  停止蹦迪() {
    this.蹦迪剩余 = 0;
    this.容器.rotation.y = 0;
  }

  /** 重力反转：倒立一段时间 */
  倒立(秒 = 配置.恶搞.倒立持续秒) {
    this.倒立剩余 = 秒;
  }

  /** 气跑：好感度砸穿后侧过身走出画面，停留几秒再偷偷溜回来 */
  气跑() {
    if (this.气跑阶段) return;
    this.气跑阶段 = "走";
    this.气跑剩余 = 配置.气跑.去程秒;
    发布("气跑");
    发布("提示", { 文本: 配置.气跑.提示走 });
  }

  get 在气跑() {
    return this.气跑阶段 !== null;
  }

  get 在蹦迪() {
    return this.蹦迪剩余 > 0;
  }

  /** 弹簧积分，每帧调用 */
  更新(步长) {
    const { 模型回弹刚度: 刚度, 模型回弹阻尼: 阻尼 } = 配置.演出;

    // 位移弹簧
    this.位移速度.addScaledVector(this.位移弹簧, -刚度 * 步长);
    this.位移速度.multiplyScalar(Math.exp(-阻尼 * 步长));
    this.位移弹簧.addScaledVector(this.位移速度, 步长);

    // 扭转弹簧
    this.扭转速度.x += -刚度 * this.扭转.x * 步长;
    this.扭转速度.y += -刚度 * this.扭转.y * 步长;
    this.扭转速度.multiplyScalar(Math.exp(-阻尼 * 步长));
    this.扭转.x += this.扭转速度.x * 步长;
    this.扭转.y += this.扭转速度.y * 步长;

    // 挤压缩放
    this.缩放冲击速度 += -刚度 * this.缩放冲击 * 步长;
    this.缩放冲击速度 *= Math.exp(-阻尼 * 步长);
    this.缩放冲击 += this.缩放冲击速度 * 步长;

    this.容器.position.copy(this.位移弹簧);
    this.容器.rotation.z = this.扭转.x;
    this.容器.rotation.x = this.扭转.y;
    const 挤 = 夹取(this.缩放冲击, -0.12, 0.12);
    this.容器.scale.set(1 + 挤 * 0.5, 1 - 挤, 1 + 挤 * 0.5);

    this.节拍 += 步长;
    if (this.蹦迪剩余 > 0) {
      this.蹦迪剩余 = Math.max(0, this.蹦迪剩余 - 步长);
      const t = this.节拍;
      // 蹦迪：左右摆胯 + 蹦跳 + 仰头
      this.容器.position.x += Math.sin(t * 7.2) * 0.09;
      this.容器.position.y += Math.abs(Math.sin(t * 7.2)) * 0.075;
      this.容器.rotation.y = Math.sin(t * 3.6) * 0.55;
      this.容器.rotation.z += Math.sin(t * 7.2) * 0.19;
      this.容器.scale.multiplyScalar(1 + Math.sin(t * 14.4) * 0.02);
      if (this.蹦迪剩余 === 0) this.容器.rotation.y = 0;
    }

    if (this.倒立剩余 > 0) {
      this.倒立剩余 = Math.max(0, this.倒立剩余 - 步长);
      // 倒立：绕模型腰线翻 180°，进出各留一段缓动，避免瞬移
      const 已过 = 配置.恶搞.倒立持续秒 - this.倒立剩余;
      const 包络 = 夹取(Math.min(已过 / 0.8, this.倒立剩余 / 0.8), 0, 1);
      const 角 = Math.PI * 包络;
      const 半高 = this.高度 * 0.5;
      this.容器.rotation.z += 角;
      // 补上绕腰线旋转需要的位移，不然整个人会翻到地板底下去
      this.容器.position.x += 半高 * Math.sin(角);
      this.容器.position.y += 半高 * (1 - Math.cos(角));
    }

    // 气跑：整个容器横着滑出画面，停留几秒再溜回来
    if (this.气跑阶段) {
      const { 去程秒, 滞留秒, 回程秒 } = 配置.气跑;
      this.气跑剩余 -= 步长;
      if (this.气跑阶段 === "走") {
        this.气跑进度 = 1 - 夹取(this.气跑剩余 / 去程秒, 0, 1);
        if (this.气跑剩余 <= 0) {
          this.气跑阶段 = "待";
          this.气跑剩余 = 滞留秒;
        }
      } else if (this.气跑阶段 === "待") {
        if (this.气跑剩余 <= 0) {
          this.气跑阶段 = "回";
          this.气跑剩余 = 回程秒;
        }
      } else {
        this.气跑进度 = 夹取(this.气跑剩余 / 回程秒, 0, 1);
        if (this.气跑剩余 <= 0) {
          this.气跑阶段 = null;
          this.气跑进度 = 0;
          发布("提示", { 文本: 配置.气跑.提示回 });
        }
      }
      const 偏移 = 缓入缓出(this.气跑进度);
      this.容器.position.x += 偏移 * 配置.气跑.离场距离;
      this.容器.rotation.y += 偏移 * Math.PI * 0.5;
    }

    if (this.冰冻 > 0) {
      this.冰冻 = Math.max(0, this.冰冻 - 步长);
      if (this.冰冻 === 0) this.解冻();
    }

    // 动作系统：每帧求值姿态（分割模型隐藏时只是空转，不耗多少）
    this.动作系统?.更新(步长);
  }

  /* ── 冰冻 ─────────────────────────────── */

  冻结(秒 = 配置.演出.冻结时长秒) {
    for (const { 材质, 颜色 } of this.原始材质) {
      if (!颜色) continue;
      材质.color.copy(颜色).lerp(冰色, 0.72);
      if ("roughness" in 材质) 材质.roughness = 0.15;
      if ("metalness" in 材质) 材质.metalness = 0.1;
    }
    this.冰冻 = 秒;
  }

  解冻() {
    for (const { 材质, 颜色, 粗糙度, 金属度 } of this.原始材质) {
      if (颜色) 材质.color.copy(颜色);
      // 冻结时改过粗糙度/金属度，不还原的话模型会一直留着冰面光泽
      if (粗糙度 !== null) 材质.roughness = 粗糙度;
      if (金属度 !== null) 材质.metalness = 金属度;
    }
  }

  /** 暴怒时整只变红 */
  设置怒气(比例) {
    const 量 = 夹取(比例, 0, 1) * 0.55;
    for (const { 材质, 颜色 } of this.原始材质) {
      if (!颜色 || this.冰冻 > 0) continue;
      材质.color.copy(颜色).lerp(怒色, 量);
    }
  }
}

const 冰色 = new THREE.Color("#7fd0ff");
const 怒色 = new THREE.Color("#ff2f2f");

function 载入模型(路径, 加载器, 进度回调) {
  return new Promise((完成, 失败) => {
    加载器.load(
      路径,
      (gltf) => 完成(gltf),
      (事件) => {
        if (事件.total) {
          const 已MB = (事件.loaded / 1048576).toFixed(1);
          const 总MB = (事件.total / 1048576).toFixed(1);
          进度回调?.(夹取(事件.loaded / 事件.total, 0, 1), `${路径}（${已MB}/${总MB} MB）`);
        }
      },
      (错误) => 失败(错误)
    );
  });
}

function 读显存档() {
  const 档 = { 弱: false, 原因: "" };
  try {
    const 画布 = document.createElement("canvas");
    const 上下文 = 画布.getContext("webgl2") || 画布.getContext("webgl");
    if (上下文) {
      const 调试信息 = 上下文.getExtension("WEBGL_debug_renderer_info");
      const 渲染器名 = 调试信息
        ? String(上下文.getParameter(调试信息.UNMASKED_RENDERER_WEBGL) || "")
        : "";
      if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(渲染器名)) {
        档.弱 = true;
        档.原因 = "软件渲染";
      }
    }
  } catch {
    档.原因 = 档.原因 || "渲染器探测失败";
  }
  try {
    if (typeof navigator !== "undefined" && "deviceMemory" in navigator) {
      const 内存 = Number(navigator.deviceMemory || 0);
      if (内存 > 0) {
        档.内存 = 内存;
        if (内存 <= 4) {
          档.弱 = true;
          档.原因 = 档.原因 || "小内存设备";
        }
      }
    }
  } catch {
    档.原因 = 档.原因 || "内存探测失败";
  }
  return 档;
}

function 该用低模() {
  try {
    const 档 = 读显存档();
    if (档.弱) return true;
    const 连 = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (连?.saveData) return true;
    if (连 && ["slow-2g", "2g", "3g"].includes(String(连.effectiveType || ""))) return true;
    if (/Mobi|Android|iPhone|iPod/i.test(navigator.userAgent || "")) return true;
  } catch {
    /* 探测失败就走高模 */
  }
  return false;
}

async function 路径存在(路径) {
  try {
    const 响应 = await fetch(路径, { method: "HEAD" });
    if (响应.ok) return true;
  } catch {
    /* HEAD 被某些静态托管禁了，再试 GET 探测 */
  }
  try {
    const 响应 = await fetch(路径, { method: "GET", headers: { Range: "bytes=0-1" } });
    return 响应.ok;
  } catch {
    return false;
  }
}

async function 收集模型路径() {
  const 列表 = [];
  if (配置.模型.低模路径 && 该用低模() && (await 路径存在(配置.模型.低模路径))) {
    列表.push(配置.模型.低模路径);
  }
  const 清单 = await 读模型清单();
  if (清单) {
    for (const 路径 of [清单.主, 清单.低]) {
      if (路径 && !列表.includes(路径)) 列表.push(路径);
    }
  }
  for (const 来源 of [...(配置.模型.资源?.镜像源 || []), ...配置.模型.候选路径]) {
    if (来源 && !列表.includes(来源)) 列表.push(来源);
  }
  return 列表;
}

async function 读模型清单() {
  try {
    const 清单路径 = 配置.模型.资源?.清单路径;
    if (!清单路径) return null;
    const 响应 = await fetch(清单路径, { cache: "no-store" });
    if (!响应.ok) return null;
    const 清单 = await 响应.json();
    if (!清单 || typeof 清单 !== "object") return null;
    const 主 = typeof 清单.主 === "string" ? 清单.主 : null;
    const 低 = typeof 清单.低 === "string" ? 清单.低 : null;
    return { 主, 低 };
  } catch {
    return null;
  }
}
