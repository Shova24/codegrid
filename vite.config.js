import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  publicDir: "public",
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    open: true,
  },
});
