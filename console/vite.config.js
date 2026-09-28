// Two outputs, published side by side under admin.theedgeofthemap.com:
//   dist/console/<version>/console.js  the editor, immutable once published
//   dist/loader.js                     the tiny script customer sites include
// `npm run build` builds both (vite build runs this config twice via BUILD).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

const target = process.env.BUILD ?? 'console'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: { __CONSOLE_VERSION__: JSON.stringify(pkg.version), 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    sourcemap: true,
    lib: {
      loader: { entry: 'src/loader.js', formats: ['iife'], name: 'EOTMLoader', fileName: () => 'loader.js' },
      dashboard: { entry: 'src/dashboard.js', formats: ['iife'], name: 'EOTMDashboard', fileName: () => 'dashboard.js' },
      console: { entry: 'src/console.jsx', formats: ['iife'], name: 'EOTMConsole', fileName: () => `console/${pkg.version}/console.js` },
    }[target],
  },
  test: { environment: 'node' },
})
