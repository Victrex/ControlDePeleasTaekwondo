import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // La app React vive en /client, así que la usamos como raíz
  root: 'client',
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    // Generar el build en /dist (raíz del proyecto), que es lo que sirve Express
    outDir: '../dist',
    emptyOutDir: true
  }
});
