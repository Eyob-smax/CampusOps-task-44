import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-vue": ["vue", "vue-router", "pinia"],
          "vendor-ui": ["element-plus", "@element-plus/icons-vue"],
          "vendor-network": ["axios", "socket.io-client"],
        },
      },
    },
  },

  server: {
    port: 5173,
  },
});
