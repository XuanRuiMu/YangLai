import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { 配置, 取灯光预设列表 } from "./config.js";
import { 夹取, 随机, 阻尼插值 } from "./utils.js";

const 灯光预设列表 = 取灯光预设列表();
const 临时向量 = new THREE.Vector3();
const 复用尺寸 = new THREE.Vector3();
const 复用中心 = new THREE.Vector3();
const 复用包围球 = new THREE.Sphere();
const 复用震动 = new THREE.Vector3();

/** 用 canvas 生成一张中心亮、边缘透明的圆盘贴图，当地板用 */
function 造地板贴图() {
  const 边长 = 512;
  const 画布 = document.createElement("canvas");
  画布.width = 边长;
  画布.height = 边长;
  const 笔 = 画布.getContext("2d");
  const 心 = 边长 / 2;
  const 渐变 = 笔.createRadialGradient(心, 心, 0, 心, 心, 心);
  渐变.addColorStop(0, "rgba(255,255,255,0.55)");
  渐变.addColorStop(0.35, "rgba(255,255,255,0.22)");
  渐变.addColorStop(0.72, "rgba(255,255,255,0.05)");
  渐变.addColorStop(1, "rgba(255,255,255,0)");
  笔.fillStyle = 渐变;
  笔.fillRect(0, 0, 边长, 边长);
  // 几圈同心细线，增加"舞台聚光"的质感
  笔.strokeStyle = "rgba(255,255,255,0.06)";
  笔.lineWidth = 1.5;
  for (let i = 1; i <= 6; i++) {
    笔.beginPath();
    笔.arc(心, 心, (心 * i) / 6.6, 0, Math.PI * 2);
    笔.stroke();
  }
  const 纹理 = new THREE.CanvasTexture(画布);
  纹理.colorSpace = THREE.SRGBColorSpace;
  return 纹理;
}

export class 舞台 {
  constructor(画布) {
    this.画布 = 画布;
    this.宽 = 1;
    this.高 = 1;
    this.震动 = 0;
    this.像素比上限 = 配置.模型.最大像素比;
    this.启用阴影 = 配置.舞台.启用阴影;
    this.灯光序号 = 0;
    this.帧回调 = new Set();
    this.计时 = new THREE.Timer();
    this.计时.connect(document);
    this.帧率样本 = [];
    this.画质等级 = "高";
    this.粒子系数 = 1;
    this.渲染器坏了 = false;

    let 渲染器 = null;
    let 构造错误 = null;
    try {
      渲染器 = new THREE.WebGLRenderer({
        canvas: 画布,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
    } catch (错误) {
      构造错误 = 错误;
    }
    if (!渲染器 || !渲染器.getContext()) {
      if (!构造错误) {
        try {
          const 探针 = 画布.getContext("webgl2") || 画布.getContext("webgl");
          if (!探针) 构造错误 = new Error("无可用 WebGL 上下文");
        } catch (探针错误) {
          构造错误 = 探针错误;
        }
      }
      if (构造错误 || !渲染器) this.标记渲染失败(画布, 构造错误 || new Error("渲染器创建失败"));
    }
    if (this.渲染器坏了) return;
    this.渲染器 = 渲染器;
    this.上下文丢过 = false;
    try {
      画布.addEventListener("webglcontextlost", (事件) => {
        事件.preventDefault();
        try {
          画布.dispatchEvent(new CustomEvent("阳来上下文丢失"));
        } catch {
        }
        if (this.上下文丢过) return;
        this.上下文丢过 = true;
        try {
          this.停止();
        } catch {
        }
        try {
          const 还原 = () => {
            try {
              this.渲染器?.forceContextRestore?.();
            } catch {
            }
          };
          const 重建钮 = document.querySelector("#重建舞台");
          if (重建钮) {
            重建钮.hidden = false;
            重建钮.onclick = () => {
              try {
                还原();
                重建钮.hidden = true;
              } catch {
              }
            };
          }
          画布.addEventListener("webglcontextrestored", () => {
            this.上下文丢过 = false;
            try {
              this.开始();
            } catch {
            }
            try {
              if (重建钮) 重建钮.hidden = true;
            } catch {
            }
          }, { once: true });
          setTimeout(还原, 500);
        } catch {
        }
      });
    } catch {
    }
    this.渲染器.outputColorSpace = THREE.SRGBColorSpace;
    this.渲染器.toneMapping = THREE.ACESFilmicToneMapping;
    this.渲染器.toneMappingExposure = 1.05;
    this.渲染器.shadowMap.enabled = this.启用阴影;
    this.渲染器.shadowMap.type = THREE.PCFShadowMap;

    this.场景 = new THREE.Scene();
    this.背景色 = new THREE.Color(配置.灯光预设.舞台.背景);
    this.场景.background = this.背景色;
    const 环境烘焙 = new THREE.PMREMGenerator(this.渲染器);
    this.场景.environment = 环境烘焙.fromScene(new RoomEnvironment(), 0.04).texture;
    环境烘焙.dispose();
    this.相机 = new THREE.PerspectiveCamera(配置.模型.视野角度, 1, 配置.模型.近裁面, 配置.模型.远裁面);

    this.控制器 = new OrbitControls(this.相机, 画布);
    this.控制器.enableDamping = true;
    this.控制器.dampingFactor = 配置.模型.阻尼;
    this.控制器.enablePan = true;
    this.控制器.panSpeed = 0.6;
    this.控制器.rotateSpeed = 0.85;
    this.控制器.zoomSpeed = 0.9;
    this.控制器.minPolarAngle = 配置.模型.最低极角;
    this.控制器.maxPolarAngle = 配置.模型.最高极角;
    this.控制器.autoRotate = 配置.模型.自动旋转;
    this.控制器.autoRotateSpeed = 配置.模型.自动旋转速度;
    this.控制器.target.set(0, 0.6, 0);
    try {
      画布.style.touchAction = "none";
    } catch {
    }

    // 自动旋转临时暂停（拖拽道具、用户操作时）
    this.旋转锁定 = 0;
    this.旋转挂起 = false;

    // 用户一上手就让机位缓动让位，避免"抢镜头"
    this.控制器.addEventListener("start", () => {
      this.拖拽中 = true;
      this.机位过渡中 = false;
    });
    this.控制器.addEventListener("end", () => {
      this.拖拽中 = false;
    });

    this.建灯光();
    this.建地板();
    this.建尘粒();

    this.应用灯光预设(0);
    this.监听尺寸();
    this.调整尺寸();
  }

  标记渲染失败(画布, 错误) {
    this.渲染器坏了 = true;
    try {
      const 提示 = document.createElement("div");
      提示.className = "渲染降级";
      提示.setAttribute("role", "alert");
      提示.textContent = "当前浏览器不支持 WebGL，3D 舞台暂不可用；弹幕与道具面板仍可浏览。";
      const 占位 = document.createElement("canvas");
      占位.id = "stage";
      占位.setAttribute("role", "img");
      占位.setAttribute("aria-label", "3D 舞台不可用：当前浏览器不支持 WebGL");
      画布.replaceWith(占位);
      占位.after(提示);
    } catch {
    }
    throw 错误;
  }

  /* ── 场景搭建 ───────────────────────────────── */

  建灯光() {
    this.环境光 = new THREE.AmbientLight(0xffffff, 配置.舞台.环境光强度);
    this.主光 = new THREE.DirectionalLight(0xffffff, 2);
    this.补光 = new THREE.DirectionalLight(0xffffff, 0.8);
    this.底光 = new THREE.PointLight(0xffffff, 20, 配置.舞台.底光照射半径, 2);

    const 主光位置 = 配置.舞台.主光距离;
    this.主光.position.set(主光位置[0], 主光位置[1], 主光位置[2]);
    this.主光.castShadow = true;
    this.主光.shadow.mapSize.set(配置.舞台.阴影贴图边长, 配置.舞台.阴影贴图边长);
    this.主光.shadow.camera.near = 0.1;
    this.主光.shadow.camera.far = 16;
    this.主光.shadow.bias = -0.0012;
    this.主光.shadow.normalBias = 0.02;
    const 范围 = 配置.舞台.主光照射范围;
    Object.assign(this.主光.shadow.camera, { left: -范围, right: 范围, top: 范围, bottom: -范围 });
    this.主光.shadow.camera.updateProjectionMatrix();

    const 补光位置 = 配置.舞台.补光位置;
    this.补光.position.set(补光位置[0], 补光位置[1], 补光位置[2]);
    const 底光位置 = 配置.舞台.底光位置;
    this.底光.position.set(底光位置[0], 底光位置[1], 底光位置[2]);

    this.场景.add(this.环境光, this.主光, this.补光, this.底光, this.主光.target);
  }

  建地板() {
    const 半径 = 配置.舞台.地板半径;
    const 几何 = new THREE.CircleGeometry(半径, 配置.舞台.地板段数);
    const 材质 = new THREE.MeshStandardMaterial({
      color: 配置.舞台.地板色,
      roughness: 配置.舞台.地板粗糙度,
      metalness: 配置.舞台.地板反光强度,
      transparent: true,
      alphaMap: 造地板贴图(),
      depthWrite: false,
    });
    this.地板 = new THREE.Mesh(几何, 材质);
    this.地板.rotation.x = -Math.PI / 2;
    this.地板.receiveShadow = true;
    this.地板.position.y = 0;
    this.场景.add(this.地板);

    // 地板下方一圈发光环，强调舞台感
    const 光环比例 = 配置.舞台.光环半径比例;
    const 环几何 = new THREE.RingGeometry(半径 * 光环比例[0], 半径 * 光环比例[1], 配置.舞台.光环分段);
    const 环材质 = new THREE.MeshBasicMaterial({
      color: 配置.舞台.光环色,
      transparent: true,
      opacity: 配置.舞台.光环初始透明度,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.光环 = new THREE.Mesh(环几何, 环材质);
    this.光环.rotation.x = -Math.PI / 2;
    this.光环.position.y = 0.002;
    this.场景.add(this.光环);
  }

  建尘粒() {
    const 数量 = 配置.舞台.背景尘粒数量;
    const 位置 = new Float32Array(数量 * 3);
    const 速度 = new Float32Array(数量);
    const 范围 = 配置.舞台.尘粒活动范围;
    for (let i = 0; i < 数量; i++) {
      const 角 = Math.random() * Math.PI * 2;
      const 半径 = Math.sqrt(Math.random()) * 范围[2];
      位置[i * 3] = Math.cos(角) * 半径;
      位置[i * 3 + 1] = Math.random() * (范围[4] - 范围[3]) + 范围[3];
      位置[i * 3 + 2] = Math.sin(角) * 半径;
      速度[i] = 随机(范围[0], 范围[1]);
    }
    const 几何 = new THREE.BufferGeometry();
    几何.setAttribute("position", new THREE.BufferAttribute(位置, 3));
    this.尘粒速度 = 速度;
    this.尘粒几何 = 几何;
    this.尘粒 = new THREE.Points(
      几何,
      new THREE.PointsMaterial({
        color: 配置.舞台.尘粒色,
        size: 配置.舞台.尘粒大小,
        transparent: true,
        opacity: 配置.舞台.尘粒透明度,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    this.场景.add(this.尘粒);
  }

  /* ── 灯光 / 相机 ─────────────────────────────── */

  应用灯光预设(序号) {
    this.灯光序号 = ((序号 % 灯光预设列表.length) + 灯光预设列表.length) % 灯光预设列表.length;
    const 预设 = 灯光预设列表[this.灯光序号];
    this.背景色.set(预设.背景);
    this.环境光.color.set(预设.环境色);
    this.环境光.intensity = 预设.环境强度;
    this.主光.color.set(预设.主色);
    this.主光.intensity = 预设.主强度 / 100;
    this.补光.color.set(预设.补色);
    this.补光.intensity = 预设.补强度 / 100;
    this.底光.color.set(预设.底光);
    this.底光.intensity = 预设.底光强度 / 10;
    return 预设;
  }

  切灯光() {
    return this.应用灯光预设(this.灯光序号 + 1);
  }

  get 当前灯光() {
    return 灯光预设列表[this.灯光序号];
  }

  /**
   * 相机机位：极角 = 与 +Y 轴夹角，方位角 = 绕 Y 轴角度。
   * 只改目标球坐标，由每帧缓动逼近，这样和 OrbitControls 不打架。
   */
  设置机位({ 方位角, 极角, 距离系数 }) {
    this.目标球 = {
      方位角: 方位角 ?? this.读球坐标().方位角,
      极角: 极角 ?? this.读球坐标().极角,
      半径: this.基准距离 * (距离系数 ?? 1),
    };
    this.机位过渡中 = true;
  }

  立即设置机位(机位) {
    this.设置机位(机位);
    this.写球坐标(this.目标球);
    this.机位过渡中 = false;
  }

  读球坐标() {
    const 偏移 = 临时向量.subVectors(this.相机.position, this.控制器.target);
    const 半径 = Math.max(1e-4, 偏移.length());
    return {
      半径,
      极角: Math.acos(夹取(偏移.y / 半径, -1, 1)),
      方位角: Math.atan2(偏移.x, 偏移.z),
    };
  }

  写球坐标({ 半径, 极角, 方位角 }) {
    const 心 = this.控制器.target;
    const 半径限 = 夹取(半径, this.控制器.minDistance, this.控制器.maxDistance);
    this.相机.position.set(
      心.x + 半径限 * Math.sin(极角) * Math.sin(方位角),
      心.y + 半径限 * Math.cos(极角),
      心.z + 半径限 * Math.sin(极角) * Math.cos(方位角)
    );
    this.相机.lookAt(心);
  }

  /** 机位缓动，走最短路径转过去 */
  更新机位(步长) {
    if (!this.机位过渡中 || !this.目标球) return;
    const 当前 = this.读球坐标();
    const 目标 = this.目标球;

    // 方位角取最短弧
    let 差 = ((目标.方位角 - 当前.方位角 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const 新方位 = 当前.方位角 + 差 * (1 - Math.exp(-5 * 步长));
    const 新极角 = 阻尼插值(当前.极角, 目标.极角, 5, 步长);
    const 新半径 = 阻尼插值(当前.半径, 目标.半径, 5, 步长);
    this.写球坐标({ 半径: 新半径, 极角: 新极角, 方位角: 新方位 });

    if (
      Math.abs(差) < 0.004 &&
      Math.abs(新极角 - 目标.极角) < 0.004 &&
      Math.abs(新半径 - 目标.半径) < 0.004
    ) {
      this.机位过渡中 = false;
    }
  }

  /** 让相机取景刚好装下模型 */
  取景(包围盒) {
    包围盒.getSize(复用尺寸);
    包围盒.getCenter(复用中心);
    复用包围球.set(复用中心, 复用尺寸.length() * 0.5);

    this.控制器.target.copy(复用中心);
    this.主光.target.position.copy(复用中心);

    const 张角 = THREE.MathUtils.degToRad(配置.模型.视野角度);
    const 纵横比 = this.宽 / Math.max(1, this.高);
    const 横张角 = 2 * Math.atan(Math.tan(张角 / 2) * 纵横比);
    const 有效张角 = Math.min(张角, 横张角);
    const 距离 = 复用包围球.radius * 配置.模型.取景留白 / Math.sin(有效张角 / 2);

    this.基准距离 = 距离;
    this.控制器.minDistance = 距离 * 配置.模型.最小距离系数;
    this.控制器.maxDistance = 距离 * 配置.模型.最大距离系数;
    this.立即设置机位({
      方位角: 配置.模型.初始方位角,
      极角: 配置.模型.初始极角,
      距离系数: 1,
    });
  }

  /* ── 交互辅助 ───────────────────────────────── */

  暂停自动旋转(秒 = 2.5) {
    this.旋转锁定 = Math.max(this.旋转锁定, 秒);
  }

  挂起自动旋转() {
    this.旋转挂起 = true;
    this.旋转锁定 = 0;
  }

  恢复自动旋转() {
    this.旋转挂起 = false;
    this.旋转锁定 = 0;
  }

  震一下(强度) {
    if (this.渲染器坏了) return;
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    } catch {
    }
    this.震动 = Math.min(配置.演出.震动最大, this.震动 + 强度);
  }

  /* ── 画质 ───────────────────────────────────── */

  设置画质({ 像素比, 阴影 }) {
    this.像素比上限 = 像素比;
    this.启用阴影 = 阴影;
    this.渲染器.shadowMap.enabled = 阴影;
    this.主光.castShadow = 阴影;
    this.调整尺寸();
  }

  设置尘粒数(目标数) {
    const 几何 = this.尘粒几何;
    const 位置 = 几何?.attributes.position;
    if (!几何 || !位置) return;
    const 总数 = this.尘粒速度.length;
    const 目标 = 夹取(Math.round(目标数), 0, 总数);
    几何.setDrawRange(0, 目标);
    this.尘粒数 = 目标;
  }

  /* ── 尺寸 / 循环 ─────────────────────────────── */

  监听尺寸() {
    const 回调 = () => this.调整尺寸();
    window.addEventListener("resize", 回调);
    window.addEventListener("orientationchange", 回调);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", 回调);
  }

  调整尺寸() {
    const 宽 = Math.max(1, this.画布.clientWidth || window.innerWidth);
    const 高 = Math.max(1, this.画布.clientHeight || window.innerHeight);
    const 像素比 = Math.min(window.devicePixelRatio || 1, this.像素比上限);
    this.宽 = 宽;
    this.高 = 高;
    this.实际像素比 = 像素比;
    this.相机.aspect = 宽 / 高;
    this.相机.updateProjectionMatrix();
    this.渲染器.setPixelRatio(像素比);
    this.渲染器.setSize(宽, 高, false);
    if (this.尘粒?.material) this.尘粒.material.size = 配置.舞台.尘粒大小 * 像素比;
  }

  加帧回调(回调) {
    this.帧回调.add(回调);
    return () => this.帧回调.delete(回调);
  }

  开始() {
    this.渲染器.setAnimationLoop(() => this.一帧());
  }

  停止() {
    this.渲染器.setAnimationLoop(null);
  }

  一帧() {
    this.计时.update();
    const 步长 = Math.min(0.05, this.计时.getDelta());
    const 时间 = this.计时.getElapsed();

    // 自动旋转：拖拽 / 丢道具时短暂让位
    if (this.旋转锁定 > 0 && !this.旋转挂起) this.旋转锁定 = Math.max(0, this.旋转锁定 - 步长);
    const 想要旋转 = 配置.模型.自动旋转 && this.旋转锁定 === 0 && !this.旋转挂起 && !this.拖拽中;
    this.控制器.autoRotate = 想要旋转;

    this.更新机位(步长);
    this.控制器.update();
    this.更新尘粒(步长);
    this.更新光环(时间);

    for (const 回调 of this.帧回调) 回调(步长, 时间);

    // 震动：渲染前临时偏移相机，渲染后立即还原
    let 有震动 = false;
    if (this.震动 > 0.05) {
      const 幅度 = this.震动 * 0.004;
      复用震动.set(随机(-幅度, 幅度), 随机(-幅度, 幅度), 随机(-幅度, 幅度) * 0.4);
      this.相机.position.add(复用震动);
      有震动 = true;
      this.震动 *= Math.pow(配置.演出.震动衰减, 步长 * 60);
      if (this.震动 < 0.05) this.震动 = 0;
    }

    this.渲染器.render(this.场景, this.相机);
    if (有震动) this.相机.position.sub(复用震动);

    this.记录帧率(步长);
  }

  更新尘粒(步长) {
    const 位置 = this.尘粒几何.attributes.position;
    const 数组 = 位置.array;
    const 范围 = 配置.舞台.尘粒活动范围;
    const 活跃数 = this.尘粒数 ?? this.尘粒速度.length;
    for (let i = 0; i < 活跃数; i++) {
      数组[i * 3 + 1] += this.尘粒速度[i] * 步长;
      if (数组[i * 3 + 1] > 范围[4]) 数组[i * 3 + 1] = 范围[3];
    }
    位置.needsUpdate = true;
    this.尘粒.rotation.y += 步长 * 范围[6];
  }

  更新光环(时间) {
    const 呼吸配置 = 配置.舞台.光环呼吸;
    const 呼吸 = 呼吸配置[0] + Math.sin(时间 * 呼吸配置[2]) * 呼吸配置[1];
    this.光环.material.opacity = 呼吸;
  }

  记录帧率(步长) {
    if (步长 <= 0) return;
    this.帧率样本.push(1 / 步长);
    if (this.帧率样本.length < 配置.画质.采样帧数) return;
    const 平均 = this.帧率样本.reduce((a, b) => a + b, 0) / this.帧率样本.length;
    this.帧率样本.length = 0;
    this.最新帧率 = 平均;
    if (this.画质回调) this.画质回调(平均);
  }

  /** 截图：渲染器保持 preserveDrawingBuffer:false 省显存，截图前强制渲染一帧再取像素 */
  截图() {
    this.渲染器.render(this.场景, this.相机);
    return this.渲染器.domElement.toDataURL("image/png");
  }
}
