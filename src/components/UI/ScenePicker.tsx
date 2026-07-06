// ScenePicker (Fase E): kuraterte scener som primær inngang. En kompakt
// frosted-glass pill-rad øverst-midt; klikk anvender lagkombinasjon +
// kamerastart + shader. LayerPanel forblir tilgjengelig som «avansert» modus.

import { useState } from 'react';
import { SCENES } from '@/types/scenes';
import { useApplyScene } from '@/hooks/useScenes';

export function ScenePicker() {
    const applyScene = useApplyScene();
    const [activeId, setActiveId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-1 pointer-events-auto">
                <button
                    onClick={() => setCollapsed((v) => !v)}
                    title={collapsed ? 'Vis scener' : 'Skjul scener'}
                    className="px-2 py-1.5 rounded-lg text-xs font-mono uppercase tracking-widest
                               bg-black/40 hover:bg-black/60 border border-white/10 backdrop-blur-md
                               text-white/70 transition-colors"
                >
                    ◇ Scener
                </button>
                {!collapsed && (
                    <div className="flex items-center gap-1 px-1 py-1 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md">
                        {SCENES.map((scene) => {
                            const active = scene.id === activeId;
                            return (
                                <button
                                    key={scene.id}
                                    onClick={() => { setActiveId(scene.id); applyScene(scene); }}
                                    title={scene.description}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono
                                                transition-colors ${active
                                            ? 'bg-white/20 text-white border border-white/30'
                                            : 'bg-white/5 hover:bg-white/15 text-white/75 border border-transparent'}`}
                                >
                                    <span className="text-sm leading-none">{scene.icon}</span>
                                    <span className="hidden sm:inline uppercase tracking-wider">{scene.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
