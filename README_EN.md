# YangLai · 阳来

> The interactive livestream stage for the 2026 animated film *YangLai* — a full 3D host you can admire, poke, and prank: double-tap to like, drag props onto him, spam danmaku, and watch him rage.

[![Stars](https://img.shields.io/github/stars/XuanRuiMu/YangLai?style=flat&logo=github)](https://github.com/XuanRuiMu/YangLai/stargazers)
[![Forks](https://img.shields.io/github/forks/XuanRuiMu/YangLai?style=flat&logo=github)](https://github.com/XuanRuiMu/YangLai/forks)
[![License](https://img.shields.io/github/license/XuanRuiMu/YangLai)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai/commits/main)
[![Issues](https://img.shields.io/github/issues/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai/issues)
[![Repo Size](https://img.shields.io/github/repo-size/XuanRuiMu/YangLai)](https://github.com/XuanRuiMu/YangLai)
[![Live](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen)](https://xuanruimu.github.io/YangLai/)
[![Powered by](https://img.shields.io/badge/powered%20by-Three.js-black)](https://threejs.org/)

> 🌐 [中文](README.md) ｜ English

---

## Try it live

🚀 **[Open the stage → https://xuanruimu.github.io/YangLai/](https://xuanruimu.github.io/YangLai/)**

![YangLai livestream](public/icons/%E6%88%AA%E5%9B%BE-%E5%AE%BD.png)

---

## What is this?

*YangLai* is a 2026 animated film whose star is a sun streamer who loves to cause trouble. This project is its **promotional livestream room**: a 3D interactive prank stage running in your browser — the host stands right in front of you. Double-tap to like, drag props onto him, spam danmaku, fill his anger bar and watch the "rage splat".

Everything is **atmosphere performance**: popularity is simulated, the online count is derived, gifts cost nothing, and the model won't actually get hurt (probably).

- **100% frontend** — no backend, no database, no login
- Nicknames / records / achievements / danmaku prefs live **only in your browser's localStorage**
- **PWA offline** — install it on your phone's home screen like an app
- Developers can run it locally with one command

---

## Core features

| Feature | Description |
| --- | --- |
| 🌞 3D host | Drag to rotate 360°, scroll to zoom, right-drag to pan; switch lighting / camera / auto-rotate |
| ❤️ Double-tap like | Double-tap anywhere on the model to pop like icons; chain taps trigger combos |
| 🎁 Prank props | Drag from the dock onto the model: roses are "gifts", tomatoes & eggs are "throws" |
| 😡 Rage splat | Max out the anger bar and the host throws a tantrum — right in your face |
| 💬 Danmaku | Keywords like "阳来", "下雨" (rain), "蹦迪" (disco), "反转" (flip) trigger easter eggs |
| ☄️ Prop barrage | Rain down justice from above; 🧽 one-click clean of all splats |
| 🍅 Tomato rain | Toss 10 tomatoes within 30 seconds to trigger a full-screen tomato rain |
| 🕺 Disco mode | Lights + music + color strobes, the host dances along |
| 🗣️ Voice lines | The model speaks with baked audio lines |
| 📜 Battle report | One-click generate a poster of your interactive stats |
| 🎭 Action mode | Make the host walk, run, and jump (switches to the untextured rigged model) |
| 🧩 Multi-tab sync | Open two tabs in the same browser and danmaku/likes sync in real time |
| 🏅 Achievements | Unlock prank achievements and build your medal wall |
| 🎁 Lucky viewers | Random draws for engaged viewers (atmosphere only) |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Build | [Vite](https://vite.dev/) (ES2020, gzip, three.js in a separate chunk) |
| 3D rendering | [Three.js](https://threejs.org/) + custom GLB pipeline (split rig / lite model) |
| Language | Vanilla JavaScript (zero framework) |
| PWA | Hand-rolled Service Worker (`tools/inject_sw.cjs`), manifest, offline cache |
| Deploy | GitHub Actions → GitHub Pages (`.github/workflows/deploy-pages.yml`) |
| Testing | Vitest + Playwright (`tools/verify.cjs`) |

### Engineering details worth reading

- **Adaptive quality**: frame-rate driven quality tiers, dynamic pixel ratio / particle counts, auto-disabled model spin on low-power mode — smooth even on low-end devices (see [docs/低端机实测.md](docs/低端机实测.md)).
- **Fully automated asset pipeline**: 10+ scripts in `tools/` handle GLB compression, lite-model generation, icon baking, voice baking, SW injection, budget checks — `npm run build` does it all.
- **Strict payload budget**: `npm run 预算` enforces a build-size cap to keep the page lean.
- **Content-driven configuration**: achievements / danmaku pools / prizes / lines / announcements are all externalized to `public/content/*.json`, so ops changes need no code changes.

---

## Quick start

```bash
git clone https://github.com/XuanRuiMu/YangLai.git
cd YangLai

npm install

# Dev (auto-syncs models → starts Vite on http://localhost:5173)
npm run dev

# Production build (build → inject SW → budget check)
npm run build

# Preview the build
npm run preview
```

> Note: models are compressed for Pages hosting (idle 2.6 MB / lite 1.3 MB / action 1.1 MB, ~5 MB total; rerun with `npm run 模型:压主页`). The repo keeps only the optimized production models in `public/model/`. The dev entry `index.html` sits at the repo root.

---

## Project structure

```text
YangLai/
├── index.html            # App entry (single page: danmaku layer, prop dock, controls…)
├── vite.config.js        # Vite config (three.js split, gzip, plugin chain)
├── package.json          # Scripts & deps (only runtime dep is three.js)
├── src/                  # All source (modular vanilla JS)
│   ├── main.js           # Bootstrap: assembles stage/model/particles/danmaku/UI…
│   ├── stage.js          # 3D stage rendering
│   ├── model.js          # Model loading & switching
│   ├── props.js          # Prop system (drag & throw onto the model)
│   ├── danmu.js          # Danmaku / keyword easter eggs
│   ├── likes.js          # Double-tap likes & combos
│   ├── achv.js           # Achievements
│   ├── pranks.js         # Rage / splat / tomato rain / disco effects
│   ├── hall.js           # Livestream hall (online count / popularity / gift rank)
│   ├── pins.js decals.js # Pins / splat decals
│   ├── poster.js         # Battle-report poster
│   ├── speech.js audio.js# Voice lines
│   └── …                 # state / UI / analytics / PWA / a11y
├── public/               # Static assets
│   ├── content/          # achievements / danmaku / prizes / lines / notices (JSON)
│   ├── model/            # production GLB models (full / split / lite)
│   ├── audio/vo/         # baked voice lines
│   └── icons/            # PWA icons & screenshots
├── tools/                # build-time scripts (model/icon/voice/budget/verify)
├── docs/                 # test reports (low-end devices, fonts & emoji)
├── CHANGELOG.md          # Version history
└── LICENSE               # License
```

---

## Tests & verification

```bash
npm run 验证        # toolchain self-check (verify.cjs)
npm run 预算        # payload budget check
npm run audit:check # dependency security audit
```

---

## Links

- 🌞 [Live stage](https://xuanruimu.github.io/YangLai/)
- 📖 [Changelog](CHANGELOG.md) ｜ [Privacy](public/privacy.html) ｜ [Terms](public/terms.html)
- 🎬 The animated film *YangLai* — coming soon

---

## License

See [LICENSE](LICENSE).

**Made with ❤️ — double-tap to like, and get the party started!**