import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
    proxy: {
      // Local dev: forward /api to the deployed Vercel functions (prod serves
      // them same-origin, so this only affects `npm run dev`)
      "/api": {
        target: "https://propreel-xi.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
