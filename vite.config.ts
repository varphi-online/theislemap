import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

const repositoryName = 'theislemap';

export default defineConfig(({command})=>{return {
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
      alias: {
        "~": path.resolve(__dirname, "app"),
      },
    },
  base: command === 'build' ? `/${repositoryName}/` : '/',
}});
