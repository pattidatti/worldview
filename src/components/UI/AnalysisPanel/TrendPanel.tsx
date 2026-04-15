import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useGates } from '@/context/GateContext';
import { useGateTrend } from '@/hooks/useGateTrend';
import { AnalysisPanelFrame } from './AnalysisPanelFrame';
import type { DragPosition } from '@/hooks/useDrag';

interface TrendPanelProps {
    gateId: string;
    position: DragPosition;
    onPositionChange: (pos: DragPosition) => void;
    onClose: () => void;
}

const PANEL_WIDTH = 360;
const CHART_HEIGHT = 120;

export function TrendPanel({ gateId, position, onPositionChange, onClose }: TrendPanelProps) {
    const { gates } = useGates();
    const { buckets, total } = useGateTrend(gateId);
    const containerRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<uPlot | null>(null);

    const gate = gates.find((g) => g.id === gateId);
    const name = gate?.name ?? 'Ukjent port';

    useEffect(() => {
        if (!containerRef.current) return;
        const xs: number[] = buckets.map((b) => b.ts / 1000);
        const ys: number[] = buckets.map((b) => b.count);

        const opts: uPlot.Options = {
            width: PANEL_WIDTH - 24,
            height: CHART_HEIGHT,
            padding: [4, 4, 4, 4],
            legend: { show: false },
            scales: { x: { time: true }, y: { auto: true } },
            axes: [
                {
                    stroke: 'rgba(200,200,200,0.5)',
                    grid: { show: false },
                    ticks: { show: false },
                    font: '9px var(--font-mono, monospace)',
                },
                {
                    stroke: 'rgba(200,200,200,0.5)',
                    grid: { stroke: 'rgba(255,255,255,0.05)' },
                    ticks: { show: false },
                    font: '9px var(--font-mono, monospace)',
                    size: 30,
                },
            ],
            series: [
                {},
                {
                    stroke: '#4a9eff',
                    width: 1.5,
                    fill: 'rgba(74,158,255,0.15)',
                    points: { show: false },
                },
            ],
            cursor: { show: false },
        };

        if (plotRef.current) {
            plotRef.current.setData([xs, ys]);
        } else {
            plotRef.current = new uPlot(opts, [xs, ys], containerRef.current);
        }

        return () => {
            // Keep plot around across re-renders; destroy only on unmount handled below.
        };
    }, [buckets]);

    useEffect(() => {
        return () => {
            plotRef.current?.destroy();
            plotRef.current = null;
        };
    }, []);

    if (!gate) {
        // Port slettet — lukk seg selv.
        return null;
    }

    return (
        <AnalysisPanelFrame
            title={`⛩ ${name}`}
            subtitle="Kryssinger per 15 min · siste 24t"
            initialPosition={position}
            onPositionChange={onPositionChange}
            onClose={onClose}
            width={PANEL_WIDTH}
        >
            <div className="flex flex-col gap-2 text-xs">
                {total === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                        Ingen kryssinger siste 24t — prøv en travlere port.
                    </div>
                ) : (
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl tabular-nums" style={{ color: 'var(--accent-blue)' }}>
                            {total}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em' }}>
                            TOTALT 24T
                        </span>
                    </div>
                )}
                <div ref={containerRef} style={{ width: PANEL_WIDTH - 24 }} />
            </div>
        </AnalysisPanelFrame>
    );
}
