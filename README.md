# 羊来 · YangLai

> 2026 年动画电影《羊来》宣传直播间 —— 全方面 3D 展示主播，双击点赞、拖拽道具整蛊、弹幕刷屏的无厘头互动舞台。

[![Stars](https://img.shields.io/github/stars/XuanRuiMu/YangLai?style=flat&logo=github)](https://github.com/XuanRuiMu/YangLai/stargazers)
[![Forks](https://img.shields.io/github/forks/XuanRuiMu/YangLai?style=flat&logo=github)](https://github.com/XuanRuiMu/YangLai/forks)
[![License](https://img.shields.io/github/license/XuanRuiMu/YangLai)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai/commits/main)
[![Issues](https://img.shields.io/github/issues/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai/issues)
[![Repo Size](https://img.shields.io/github/repo-size/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai)
[![Live](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen)](https://xuanruimu.github.io/YangLai/)
[![Powered by](https://img.shields.io/badge/powered%20by-Three.js-black)](https://threejs.org/)

> 🌐 简体中文 ｜ [English](README_EN.md)

---

## 在线体验

🚀 **[立即开整 → https://xuanruimu.github.io/YangLai/](https://xuanruimu.github.io/YangLai/)**

![羊来直播间](public/icons/%E6%88%AA%E5%9B%BE-%E5%AE%BD.png)

---

## 这是什么？

《羊来》是一部 2026 年的动画电影，我们的主角是一只爱折腾的太羊主播。这个项目是它的 **宣传直播间**：一个跑在浏览器里的 3D 互动整蛊舞台——主播就站在你面前，双击点赞、拖道具砸他、发弹幕刷屏、把他惹毛看"暴怒糊屏"。

所有东西都是**气氛演出**：人气值是假的、在线人数是换算的、送礼不花钱、模型本体不会受伤（大概）。

- **纯前端**，无后端、无数据库、无需登录
- 所有昵称 / 战绩 / 成就 / 弹幕偏好只存在**你自己浏览器的 localStorage**
- 支持 **PWA 离线**，装到手机桌面当应用用
- 开发者一行命令本地跑起

---

## 核心玩法

| 玩法 | 说明 |
| --- | --- |
| 🐑 3D 主播 | 左键 360° 旋转、滚轮缩放、右键平移；可切换灯光 / 机位 / 自动旋转 |
| ❤️ 双击点赞 | 双击模型任意位置，点赞图标飘起来，连续双击触发连击 |
| 🎁 整蛊道具 | 从道具栏按住拖到模型身上：玫瑰是「献上」，西红柿鸡蛋是「砸过去」 |
| 😡 暴怒糊屏 | 把愤怒值刷满，主播当场发飙，然后糊你一脸 |
| 💬 弹幕刷屏 | 发「羊来」「下雨」「蹦迪」「反转」这类口令有彩蛋 |
| ☄️ 道具轰炸 | 天降正义；🧽 一键清洗所有污渍 |
| 🍅 番茄雨 | 30 秒内扔够 10 个西红柿，全场天降西红柿 |
| 🕺 蹦迪模式 | 灯光 + 音乐 + 彩色频闪，主播跟着摇 |
| 🗣️ 台词语音 | 模型台词配音，出场有声音 |
| 📜 战报海报 | 一键生成你的本场作战战绩海报 |
| 🎭 动作栏 | 让主播走、跑、跳（切换到未上色分割模型）|
| 🧩 多标签互通 | 同一个浏览器开两个标签，弹幕和点赞实时互通 |
| 🏅 成就系统 | 解锁各种整蛊成就，累积勋章墙 |
| 🎁 幸运观众 | 定时抽取发言 / 点赞观众，自动入围（气氛演出）|

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 构建 | [Vite](https://vite.dev/)（ES2020 目标、gzip 压缩、three.js 单独 chunk）|
| 3D 渲染 | [Three.js](https://threejs.org/) + 自研 GLB 模型管线（分割模型 / lite 低配模型）|
| 语言 | 原生 JavaScript（零框架）|
| PWA | 自定义 Service Worker（`tools/注入离线缓存.cjs` 注入）、manifest、离线缓存 |
| 部署 | GitHub Actions → GitHub Pages（`.github/workflows/deploy-pages.yml`）|
| 测试 | Vitest + Playwright（`tools/自检.cjs`）|

### 值得一提的工程细节

- **画质自适应**：按帧率自动切换画质等级，动态调整像素比 / 粒子数，低画质和省电模式自动关闭模型自动旋转——低端机也能流畅整蛊（见 [docs/低端机实测.md](docs/低端机实测.md)）。
- **全自动化模型管线**：`tools/` 下 10+ 个脚本做 GLB 压缩优化、轻量模型生成、图标批量制作、语音烘焙、SW 注入、预算检查，`npm run build` 一步到位。
- **严格内容预算**：`npm run 预算` 检查产物体积上限，防止页面膨胀。
- **多语言内容配置**：成就 / 弹幕池 / 奖品 / 台词 / 公告全部外置到 `public/content/*.json`，不用改代码就能运营。

---

## 快速开始

```bash
# 克隆
git clone https://github.com/XuanRuiMu/YangLai.git
cd YangLai

# 安装依赖
npm install

# 本地开发（自动同步模型 → 启动 Vite，默认 http://localhost:5173）
npm run dev

# 生产构建（构建 → 注入 SW → 预算检查）
npm run build

# 本地预览产物
npm run preview
```

> 注意：包名 `yanglai-stage` 为 npm 合规形态（纯 ASCII 全小写无连字符变体）；仓库名 `YangLai`、页面品牌中文名「羊来」保持不动。3D 模型已按 Pages 承载档压缩（待机 2.6 MB / lite 1.3 MB / 动作 1.1 MB，合计约 5 MB，跑 `npm run 模型:压主页` 可重跑）；仓库中仅保留生产用优化模型到 `public/model/`；模型源文件为 `模型/吴昊阳模型原版.glb`（大体量本地保留，不入版本库）；开发入口 `index.html` 直接位于根目录。

---

## 项目结构

```text
YangLai/
├── index.html              # 应用入口（单页，弹幕层/道具栏/控制栏等全部 DOM）
├── vite.config.js          # Vite 配置（three.js 分包、gzip、构建插件链）
├── package.json            # 脚本与依赖（唯一运行时依赖 three.js）
├── src/                    # 全部源码（原生 JS 模块化）
│   ├── 主入口.js           # 应用启动：组装舞台/模型/粒子/弹幕/成就/界面等模块
│   ├── 舞台.js             # 3D 舞台渲染
│   ├── 模型.js             # 模型加载与切换
│   ├── 道具.js             # 道具系统（拖拽/砸在模型上）
│   ├── 弹幕.js             # 弹幕 / 口令彩蛋
│   ├── 点赞.js             # 双击点赞与连击
│   ├── 成就.js             # 成就系统
│   ├── 恶搞.js             # 暴怒 / 糊屏 / 番茄雨 / 蹦迪等整蛊效果
│   ├── 大厅.js             # 直播厅（在线数 / 人气 / 礼物榜）
│   ├── 标注.js / 污渍.js   # 吐槽标注 / 污渍贴花
│   ├── 战报.js             # 战报海报
│   ├── 语音.js / 音频.js   # 台词语音
│   └── ...                 # 状态、界面、埋点、离线应用、无障碍等
├── public/                 # 静态资源
│   ├── content/            # 成就/弹幕池/奖品/台词/公告（JSON）
│   ├── model/              # 生产用 GLB 模型（模型/吴昊阳模型原版.glb → 优化中间体 → public/model 覆盖）
│   ├── audio/vo/           # 烘焙好的台词语音
│   └── icons/              # PWA 图标与横截图
├── tools/                  # 构建期脚本（模型/图标/语音/预算/验证）
├── docs/                   # 实测文档（低端机、字体与表情）
├── CHANGELOG.md            # 版本历史
└── LICENSE
```

---

## 测试与验证

```bash
npm run 验证        # 运行工具链自检（自检.cjs）
npm run 预算        # 产物体积预算检查
npm run 依赖审计 # 依赖安全审计
```

---

## 相关链接

- 🐑 [在线直播间](https://xuanruimu.github.io/YangLai/)
- 📖 [更新日志](CHANGELOG.md) ｜ [隐私说明](public/privacy.html) ｜ [服务条款](public/terms.html)
- 🎬 动画电影《羊来》—— 敬请期待

---

## 许可证

[查看 LICENSE](LICENSE)

**Made with ❤️ ！双击点赞，开整！**