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

                    remote.on('open', () => {
                        console.log('[ais-proxy] connected to AISStream');
                    });

                    clientWs.on('message', (data) => {
                        if (remote.readyState === NodeWS.OPEN) {
                            remote.send(data.toString());
                        }
                    });

                    remote.on('message', (data) => {
                        if (clientWs.readyState === NodeWS.OPEN) {
                            clientWs.send(data.toString());
                        }
                    });

                    remote.on('close', () => clientWs.close());
                    remote.on('error', () => clientWs.close());
                    clientWs.on('close', () => remote.close());
                    clientWs.on('error', () => remote.close());
                });
            });
        },
    };
}

export default defineConfig({
    base: process.env.GITHUB_ACTIONS ? '/worldview/' : '/',
    plugins: [react(), tailwindcss(), cesium(), aisProxy()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
