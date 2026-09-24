import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  optimizeDeps: {
    include: [
      "@base-ui/react/button",
      "@base-ui/react/checkbox",
      "@base-ui/react/dialog",
      "@base-ui/react/input",
      "@base-ui/react/menu",
      "@base-ui/react/merge-props",
      "@base-ui/react/select",
      "@base-ui/react/separator",
      "@base-ui/react/switch",
      "@base-ui/react/tabs",
      "@base-ui/react/toast",
      "@base-ui/react/tooltip",
      "@base-ui/react/use-render",
      "@hookform/resolvers/zod",
      "@tanstack/react-query",
      "@xyflow/react",
      "ag-grid-community",
      "ag-grid-react",
      "class-variance-authority",
      "clsx",
      "cmdk",
      "elkjs/lib/elk-api.js",
      "lucide-react",
      "react",
      "react-hook-form",
      "react-router",
      "tailwind-merge",
      "zod",
      "zustand",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
  worker: {
    format: "es",
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/openapi.json": "http://127.0.0.1:8000",
      "/docs": "http://127.0.0.1:8000",
    },
  },
});
