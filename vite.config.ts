import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const repositoryName = 'theislemap';

// https://vite.dev/config/
export default defineConfig(({command})=>{return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: command === 'build' ? `/${repositoryName}/` : '/',
}})
