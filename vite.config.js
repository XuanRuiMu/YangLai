import { defineConfig } from "vite";
import compression from "vite-plugin-compression";
import { visualizer } from "rollup-plugin-visualizer";

const 开可视化 = process.env.产物分析 === "1";

export default defineConfig({
  base: "./",
  define: {
    __阳来版本__: JSON.stringify(process.env.npm_package_version || "1.0.0"),
  },
  server: { host: true, port: 3080 },
  preview: { host: true, port: 4173 },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
        },
      },
      plugins: [
        ...(开可视化
          ? [
              visualizer({
                filename: "产物分析.html",
                open: false,
                gzipSize: true,
                brotliSize: true,
              }),
            ]
          : []),
      ],
    },
  },
  plugins: [
    compression({ algorithm: "gzip", ext: ".gz", threshold: 10240, deleteOriginFile: false }),
  ],
});
