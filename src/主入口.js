import "./style.css";
import * as THREE from "three";
import { 配置, 取画质等级, 随机取 } from "./配置.js";
import { 舞台 as 舞台类 } from "./舞台.js";
import { 模型管理 } from "./模型.js";
import { 粒子系统 } from "./粒子.js";
import { 污渍管理 } from "./污渍.js";
import { 道具系统 } from "./道具.js";
import { 特效系统 } from "./特效.js";
import { 点赞系统 } from "./点赞.js";
import { 弹幕系统 } from "./弹幕.js";
import { 状态 as 状态类 } from "./状态.js";
import { 界面 as 界面类 } from "./界面.js";
import { 成就系统 } from "./成就.js";
import { 恶搞系统 } from "./恶搞.js";
import { 直播厅 } from "./大厅.js";
import { 声音 } from "./音频.js";
import { 语音 } from "./语音.js";
import { 注册离线壳 } from "./离线应用.js";
import { 标注舞台语义 } from "./无障碍.js";
import { 绑定埋点 } from "./埋点.js";
import { 拉取内容 } from "./内容.js";
import { 绑定全局错误, 应用主题, 当前主题, 当前省电 } from "./治理.js";
import { 订阅, 发布 } from "./事件.js";

async function 启动() {
  标注舞台语义();
  try {
    document.documentElement.style.setProperty("--字体栈", 配置.字体.栈);
  } catch {
  }
  绑定埋点();
  绑定全局错误();
  try {
    应用主题(当前主题());
  } catch {
  }
  拉取内容();
  let 画布 = document.querySelector("#舞台");
  let 舞台 = null;
  let 舞台可用 = true;
  try {
    舞台 = new 舞台类(画布);
    画布 = 舞台.画布 || document.querySelector("#舞台");
  } catch (错误) {
    舞台可用 = false;
  }
  if (!舞台可用 || !舞台 || !(舞台 instanceof 舞台类) || 舞台.渲染器坏了 || !舞台.渲染器) {
    try {
      const 文字 = document.querySelector("#加载文");
      if (文字) 文字.textContent = "当前浏览器不支持 WebGL，3D 舞台暂不可用；弹幕与道具面板仍可浏览。";
      document.querySelector("#加载罩")?.classList.add("隐藏");
    } catch {
    }
  注册离线壳();
    return;
  }
  const 模型 = new 模型管理(舞台);
  const 粒子 = new 粒子系统(舞台);
  const 污渍 = new 污渍管理(模型.容器);
  const 道具 = new 道具系统({ 舞台, 模型, 粒子, 污渍 });
  const 特效 = new 特效系统({ 舞台, 模型, 粒子, 污渍 });
  const 状态 = new 状态类();
  const 弹幕 = new 弹幕系统(document.querySelector("#弹幕层"));
  const 成就 = new 成就系统();
  const 点赞 = new 点赞系统({
    舞台,
    模型,
    粒子,
    层: document.querySelector("#漂浮层"),
  });
  const 界面 = new 界面类({ 舞台, 模型, 状态, 点赞, 道具, 弹幕, 特效, 成就 });
  const 恶搞 = new 恶搞系统({ 舞台, 模型, 粒子, 特效, 弹幕, 界面 });
  界面.恶搞 = 恶搞;
  弹幕.设开关(() => 语音.开启, () => 声音.开启);
  const 大厅 = new 直播厅();

  订阅("连击清零", () => 状态.清连击());

  let 就绪 = false;

  /* ── 道具命中：结算数值、反馈、特效 ─────────── */

  订阅("道具命中", ({ 道具: 命中道具, 点, 法线 }) => {
    const 是砸 = 命中道具.分类 === "投掷";

    状态.加好感(命中道具.好感);
    状态.加愤怒(命中道具.愤怒);
    声音.播放(命中道具.音效);

    if (是砸) {
      模型.挨打(法线, 1 + Math.abs(命中道具.愤怒) / 18);
      舞台.震一下(3 + Math.abs(命中道具.愤怒) * 0.55);
      if (Math.random() < 0.55) 发布("台词", { 文本: 随机取(配置.台词.被砸) });
    } else {
      模型.受宠(1);
      if (Math.random() < 0.5) 发布("台词", { 文本: 随机取(配置.台词.被献) });
    }

    if (命中道具.特效) 特效.触发(命中道具.特效, { 道具: 命中道具, 点, 法线 });
  });

  订阅("点赞", ({ 总数, 连击, 好感增量, 得分, 远程 }) => {
    状态.记点赞(总数, 连击);
    状态.加好感(好感增量);
    if (Math.random() < 0.35) 发布("台词", { 文本: 随机取(配置.台词.被赞) });
    // 自己点的赞广播给同浏览器的其他标签，远程来的不再回传避免无限循环
    if (!远程 && 得分 > 0) 大厅.发点赞(得分);
  });

  /* ── 彩蛋演出 ───────────────────────── */

  订阅("番茄雨", () => 特效.开始番茄雨());
  订阅("太羊雨", () => 特效.开始太羊雨());
  订阅("香蕉滑倒", () => {
    特效.滑倒();
    模型.挨打(new THREE.Vector3(0, 1, 0), 1.2);
    状态.加愤怒(4);
  });
  // 好感度砸穿到「不共戴天」：人直接气跑，过一会儿又偷偷溜回来
  订阅("称号变化", ({ 好感 }) => {
    if (好感 <= 配置.气跑.触发好感 && !模型.在气跑) 模型.气跑();
  });
  订阅("台词", ({ 文本 }) => 语音.说(文本));

  /* ── 多标签互通 ─────────────────────── */

  订阅("本地弹幕", ({ 内容, 昵称 }) => 大厅.发弹幕(内容, 昵称));
  订阅("远程点赞", ({ 增量 }) => {
    if (增量 > 0) 点赞.接收远程(增量);
  });

  /* ── 画质自适应（省电开时暂停，由订阅锁死最低档） ── */
  let 当前画质 = 配置.画质.阶梯[0];
  let 回升计数 = 0;
  舞台.画质回调 = (平均帧率) => {
    try {
      if (当前省电()) return;
    } catch {
    }
    const 自动旋转开 = 配置.模型.自动旋转;
    const 档 = 取画质等级(平均帧率);
    if (档.等级 === 当前画质.等级) {
      回升计数 = 0;
      return;
    }
    const 当前序号 = 配置.画质.阶梯.indexOf(当前画质);
    const 目标序号 = 配置.画质.阶梯.indexOf(档);
    if (目标序号 < 当前序号) {
      回升计数 += 1;
      const 确认次数 = 配置.画质.回升确认次数 ?? 3;
      if (回升计数 < 确认次数) return;
    }
    回升计数 = 0;
    当前画质 = 档;
    舞台.设置画质(档);
    舞台.设置尘粒数(档.尘粒数 ?? 配置.舞台.背景尘粒数量);
    粒子.设置系数(档.粒子系数);
    粒子.设置像素比(舞台.实际像素比 || 1);
    const 要低功耗关旋转 = 档.等级 === "省电" || 档.等级 === "低";
    if (要低功耗关旋转 && 自动旋转开) 界面.设置旋转(false);
    else if (!要低功耗关旋转 && !自动旋转开 && !舞台.旋转挂起) 界面.设置旋转(true);
  };

  /* ── 手动省电：开=锁最低档停自动回调，关=回最高档重启自动 ── */
  订阅("省电", ({ 开启 }) => {
    try {
      if (开启) {
        const 省电档 = 配置.画质.阶梯[配置.画质.阶梯.length - 1];
        当前画质 = 省电档;
        舞台.设置画质(省电档);
        舞台.设置尘粒数(省电档.尘粒数 ?? 配置.舞台.背景尘粒数量);
        粒子.设置系数(省电档.粒子系数);
        粒子.设置像素比(舞台.实际像素比 || 1);
        界面.设置旋转(false);
      } else {
        const 高档 = 配置.画质.阶梯[0];
        当前画质 = 高档;
        舞台.设置画质(高档);
        舞台.设置尘粒数(高档.尘粒数 ?? 配置.舞台.背景尘粒数量);
        粒子.设置系数(高档.粒子系数);
        粒子.设置像素比(舞台.实际像素比 || 1);
        界面.设置旋转(true);
      }
    } catch {
    }
  });

  /* ── 主循环 ─────────────────────────── */

  舞台.加帧回调((步长, 时间) => {
    模型.更新(步长);
    粒子.更新(步长);
    污渍.更新(步长);
    道具.更新(步长, 时间);
    特效.更新(步长);
    点赞.更新();
    状态.更新(步长);
    成就.更新(状态.在场秒);
    if (就绪) {
      弹幕.更新(步长);
      界面.更新(步长);
      恶搞.更新(步长);
    }
  });

  舞台.开始();

  /* ── 解锁声音 / 离开存档 ─────────────── */

  const 解锁 = () => 声音.解锁();
  window.addEventListener("pointerdown", 解锁, { once: true });
  window.addEventListener("keydown", 解锁, { once: true });
  window.addEventListener("pagehide", () => 状态.离开时存档());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) 舞台.停止();
    else 舞台.开始();
  });

  注册离线壳();

  /* ── 加载模型 ───────────────────────── */

  try {
    await 模型.加载((比例, 路径) => {
      const 数值 = Number(比例);
      if (!Number.isFinite(数值)) return;
      const 说明 = typeof 路径 === "string" && 路径 ? 路径 : 配置.文案.加载就位;
      const 百分比 = Math.round(Math.min(1, Math.max(0, 数值)) * 100);
      const 显示 = 说明.includes("MB") ? 说明 : 说明.split("/").pop();
      界面.设置进度(数值, `${百分比}% · ${显示}`);
    });
    就绪 = true;
    界面.设置进度(1, 配置.文案.加载就位);
    await new Promise((r) => setTimeout(r, 260));
    界面.完成加载();
    界面.检查取名();
    界面.提示(配置.文案.开播);
    发布("台词", { 文本: 配置.文案.开场白, 强制: true });
    setTimeout(() => 弹幕.发送(配置.文案.开场弹幕), 700);
    setTimeout(() => 界面.提示(配置.文案.道具提示), 2600);
    setTimeout(() => 界面.提示(配置.文案.彩蛋提示), 5200);
  } catch (错误) {
    界面.加载失败(String(错误?.message || 错误));
  }

  /* ── 验收探针（公开 DOM 数据属性，供 verify 断言，不暴露内部对象） ── */
  const 探针 = document.createElement("div");
  探针.id = "验收探针";
  探针.hidden = true;
  document.body.appendChild(探针);
  const 埋点快照 = () => {
    try {
      const 原文 = localStorage.getItem(配置.埋点.存储键);
      return 原文 ? JSON.parse(原文) : {};
    } catch {
      return {};
    }
  };
  const 战报口令快照 = () => {
    return 配置.分享.口令前缀 || "";
  };
  const 写探针 = () => {
    try {
      探针.dataset.就绪 = 就绪 ? "1" : "0";      探针.dataset.在动作 = 模型.在动作 ? "1" : "0";
      探针.dataset.当前动作 = 模型.动作系统?.当前动作 || "";
      探针.dataset.分离因子 = String(模型.动作系统?.分离因子 ?? 0);
      探针.dataset.太羊雨剩余 = String(特效.太羊雨剩余 ?? 0);
      探针.dataset.地面香蕉皮 = String(道具.地面香蕉皮?.length ?? 0);
      探针.dataset.点赞数 = String(状态.点赞数 ?? 0);
      探针.dataset.埋点 = JSON.stringify(埋点快照());
      探针.dataset.抽奖入围 = String(恶搞?.入围者?.size ?? 0);
      探针.dataset.战报口令 = 战报口令快照();
      探针.dataset.互通声明 = 配置.观众.同浏览器声明 || "";
      探针.dataset.演出声明 = 配置.礼物.演出声明 || "";
      try {
        探针.dataset.主题 = document.documentElement.dataset.主题 || 配置.主题.默认;
      } catch {
      }
      try {
        探针.dataset.语言 = document.documentElement.lang || "zh-CN";
      } catch {
      }
      try {
        探针.dataset.版本 = typeof __羊来版本__ !== "undefined" ? __羊来版本__ : "1.0.0";
      } catch {
        探针.dataset.版本 = "1.0.0";
      }
    } catch {
    }
  };
  setInterval(写探针, 500);
  写探针();

  // 调试关闭：线上 ?调试 不再暴露 window.羊来内部对象（YH-063 根因治理）。
}

启动().catch((错误) => {
  const 遮罩 = document.querySelector("#加载罩");
  if (遮罩) {
    遮罩.classList.remove("隐藏");
    遮罩.classList.add("错误");
    const 文字 = 遮罩.querySelector(".加载文");
    if (文字) 文字.textContent = String(错误?.message || 错误);
  }
});
