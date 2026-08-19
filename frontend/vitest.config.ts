// Без @vitejs/plugin-react намеренно: он тянет babel 8 и конфликтует с
// зависимостями Next. JSX в .tsx собирает esbuild сам, плагин нужен только
// ради Fast Refresh, которого в тестах нет.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
