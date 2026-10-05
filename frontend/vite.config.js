import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    host: true,
    allowedHosts: ["all"],
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL),
    "import.meta.env.MODE": JSON.stringify(process.env.MODE),
  },
});
