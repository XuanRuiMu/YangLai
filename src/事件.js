const 监听表 = new Map();

export function 订阅(名, 回调) {
  if (!监听表.has(名)) 监听表.set(名, new Set());
  监听表.get(名).add(回调);
  return () => 取消订阅(名, 回调);
}

export function 取消订阅(名, 回调) {
  监听表.get(名)?.delete(回调);
}

export function 发布(名, 负载) {
  const 监听者 = 监听表.get(名);
  if (!监听者) return;
  for (const 回调 of [...监听者]) {
    try {
      回调(负载);
    } catch {
      try {
        const 探针 = document.querySelector("#验收探针");
        if (探针) 探针.dataset.事件错误 = String(名 || "");
      } catch {
      }
    }
  }
}

export function 清空事件() {
  监听表.clear();
}
