import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['three', 'three/examples/jsm/controls/OrbitControls.js', 'lil-gui']
        }
      }
    }
  }
});
