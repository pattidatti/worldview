import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';
import path from 'path';
import { WebSocketServer, WebSocket as NodeWS } from 'ws';

function aisProxy(): Plugin {
    return {
        name: 'ais-ws-proxy',
        configureServer(server) {
            const wss = new WebSocketServer({ noServer: true });

            server.httpServer?.on('upgrade', (req, socket, head) => {
                if (req.url !== '/ais-ws') return;

                wss.handleUpgrade(req, socket, head, (clientWs) => {
                    const remote = new NodeWS('wss://stream.aisstream.io/v0/stream');
                    let pending: string | null = null;

                    remote.on('open', () => {
                        console.log('[ais-proxy] connected to AISStream');
                        if (pending) {
                            remote.send(pending);
                            pending = null;
                        }
                    });

                    clientWs.on('message', (data) => {
                        const msg = data.toString();
                        if (remote.readyState === NodeWS.OPEN) {
                            remote.send(msg);
                        } else {
                            pending = msg;
                        }
                    });

                    remote.on('message', (data) => {
                        if (clientWs.readyState === NodeWS.OPEN) {
                            clientWs.send(data.toString());
                        }
                    });

                    remote.on('close', () => clientWs.close());
                    remote.on('error', (err) => {
                        console.error('[ais-proxy] Remote connection failed:', (err as Error).message);
                        clientWs.close();
                    });
                    clientWs.on('close', () => remote.close());
                    clientWs.on('error', () => remote.close());
                });
            });
        },
    };
}

export default defineConfig({
    base: '/',
    plugins: [react(), tailwindcss(), cesium(), aisProxy()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        proxy: {
            '/proxy/airplanes': {
                target: 'https://api.airplanes.live',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy\/airplanes/, ''),
            },
            '/proxy/gdelt': {
                target: 'https://api.gdeltproject.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy\/gdelt/, ''),
            },
            '/proxy/dot': {
                target: 'https://cwwp2.dot.ca.gov',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy\/dot/, ''),
            },
            '/proxy/opensky': {
                target: 'https://opensky-network.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy\/opensky/, ''),
            },
            '/proxy/sigmet': {
                target: 'https://aviationweather.gov',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/proxy\/sigmet/, ''),
            },
        },
    },
});
