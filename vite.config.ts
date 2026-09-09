import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  optimizeDeps: {
    include: [
      "@tanstack/react-query",
      "@xyflow/react",
      "ag-grid-community",
      "ag-grid-react",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/openapi.json": "http://127.0.0.1:8000",
      "/docs": "http://127.0.0.1:8000",
    },
  },
});
