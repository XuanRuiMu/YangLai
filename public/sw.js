/* 羊来 · Service Worker
 * 策略：
 *  - 导航请求：网络优先，失败才回退缓存（保证重新部署后能拿到新版）
 *  - 其它同源 GET：先给缓存再后台更新（stale-while-revalidate）
 *  - 明确跳过：sw.js 自身、非 GET、跨域、以及体积巨大的模型文件
 *  - 音频片段走独立缓存并设数量+体积上限，超限按写入顺序淘汰最旧
 * 构建脚本 tools/注入离线缓存.cjs 会把下方的 __壳资源__ 占位替换为 dist 产物清单（含 hashed assets）。
 */
const 版本 = "阳来-壳-v2";
const 壳资源 = __壳资源__;
const 音频缓存 = "阳来-音频-v1";
const 音频最多条数 = __音频最多条数__;
const 音频最多字节 = __音频最多字节__;

const 跳过后缀 = [/\.glb($|\?)/i, /\.gltf($|\?)/i];

self.addEventListener("install", (事件) => {
  事件.waitUntil(
    caches
      .open(版本)
      .then((缓存) => 缓存.addAll(壳资源).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (事件) => {
  事件.waitUntil(
    caches
      .keys()
      .then((键列表) =>
        Promise.all(键列表.filter((键) => 键 !== 版本 && 键 !== 音频缓存).map((键) => caches.delete(键)))
      )
      .then(() => self.clients.claim())
  );
});

function 该跳过(请求) {
  if (请求.method !== "GET") return true;
  const 地址 = new URL(请求.url);
  if (地址.origin !== self.location.origin) return true;
  if (地址.pathname.endsWith("/sw.js")) return true;
  return 跳过后缀.some((规则) => 规则.test(地址.pathname) || 规则.test(地址.href));
}

function 地址是音频(地址) {
  return 地址.pathname.includes("/audio/vo/");
}

async function 清理音频缓存() {
  try {
    const 缓存 = await caches.open(音频缓存);
    const 键列表 = await 缓存.keys();
    let 总字节 = 0;
    const 条目 = [];
    for (const 键 of 键列表) {
      const 响应 = await 缓存.match(键);
      const 字节 = Number(响应?.headers.get("content-length") || 0);
      总字节 += 字节;
      条目.push({ 键, 字节 });
    }
    while (条目.length > 音频最多条数 || 总字节 > 音频最多字节) {
      const 最旧 = 条目.shift();
      if (!最旧) break;
      总字节 -= 最旧.字节;
      await 缓存.delete(最旧.键);
    }
  } catch {
  }
}

self.addEventListener("fetch", (事件) => {
  const 请求 = 事件.request;
  if (该跳过(请求)) return;

  if (请求.mode === "navigate") {
    事件.respondWith(
      fetch(请求)
        .then((响应) => {
          const 副本 = 响应.clone();
          caches.open(版本).then((缓存) => 缓存.put("./index.html", 副本)).catch(() => undefined);
          return 响应;
        })
        .catch(() =>
          caches.match("./index.html").then((命中) => 命中 || caches.match("./") || Response.error())
        )
    );
    return;
  }

  const 地址 = new URL(请求.url);
  if (地址是音频(地址)) {
    事件.respondWith(
      caches.open(音频缓存).then(async (缓存) => {
        const 命中 = await 缓存.match(请求);
        try {
          const 响应 = await fetch(请求);
          if (响应 && 响应.ok) {
            await 缓存.put(请求, 响应.clone());
            事件.waitUntil(清理音频缓存());
          }
          return 命中 || 响应;
        } catch {
          return 命中 || Response.error();
        }
      })
    );
    return;
  }

  事件.respondWith(
    caches.match(请求).then((命中) => {
      const 网络 = fetch(请求)
        .then((响应) => {
          if (响应 && 响应.ok && 响应.type === "basic") {
            const 副本 = 响应.clone();
            caches.open(版本).then((缓存) => 缓存.put(请求, 副本)).catch(() => undefined);
          }
          return 响应;
        })
        .catch(() => 命中);
      return 命中 || 网络;
    })
  );
});
