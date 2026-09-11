import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    // Strip console/debugger calls from production bundles only; dev keeps logs.
    // Vite 8 minifies with oxc via rolldown, so this is the rolldown form of the
    // option (the older `esbuild.drop` setting is silently ignored here).
    rolldownOptions:
      mode === 'production'
        ? { output: { minify: { compress: { dropConsole: true, dropDebugger: true } } } }
        : undefined,
  },
}))
