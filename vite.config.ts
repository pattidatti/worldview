import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';
import path from 'path';

export default defineConfig({
    plugins: [react(), tailwindcss(), cesium()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        proxy: {
            '/ais-ws': {
                target: 'wss://stream.aisstream.io',
                ws: true,
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/ais-ws/, '/v0/stream'),
            },
        },
    },
});
