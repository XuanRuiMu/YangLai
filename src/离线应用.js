import { 配置 } from "./配置.js";
import { 发布 } from "./事件.js";

function 通报(文本) {
  try {
    发布("提示", { 文本 });
  } catch {
  }
}

export function 注册离线壳() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const { protocol, hostname } = location;
  const 可注册 =
    protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!可注册) return;

  const 注册 = () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((注册体) => {
        通报(配置.可访问性.离线就绪);
        try {
          注册体.addEventListener("updatefound", () => {
            const 新 = 注册体.installing;
            if (!新) return;
            新.addEventListener("statechange", () => {
              if (新.state === "installed" && navigator.serviceWorker.controller) {
                通报(配置.可访问性.有新版);
              }
            });
          });
        } catch {
        }
      })
      .catch(() => {
        通报(配置.可访问性.离线失败);
      });
  };

  if (document.readyState === "complete") 注册();
  else window.addEventListener("load", 注册, { once: true });
}
