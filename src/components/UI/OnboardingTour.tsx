import { useState, useEffect } from 'react';

const STORAGE_KEY = 'worldview-onboarding-v1-seen';

const STEPS = [
    {
        title: 'Velkommen til WorldView',
        body: 'Dra på globusen for å rotere. Scroll for å zoome. Klikk på et objekt for detaljer.',
        icon: '🌍',
    },
    {
        title: 'Aktivér lag',
        body: 'Bruk lagpanelet til venstre for å slå på fly, skip, satellitter, konflikter og mye mer.',
        icon: '🛩',
    },
    {
        title: 'Tidslinjen',
        body: 'Klikk på REPLAY-knappen nederst for å bla tilbake i tid og se historiske data.',
        icon: '⏪',
    },
    {
        title: 'Snarveier',
        body: 'Ctrl+K åpner kommandopaletten. Trykk ? for å se alle tastatursnarveier.',
        icon: '⌨️',
    },
];

export function OnboardingTour() {
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setVisible(true);
            }
        } catch { /* ignore */ }
    }, []);

    if (!visible) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const handleNext = () => {
        if (isLast) {
            try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
            setVisible(false);
        } else {
            setStep((s) => s + 1);
        }
    };

    const handleSkip = () => {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
        setVisible(false);
    };

    return (
        <div
            className="fixed inset-0 z-[55] flex items-end justify-center pb-28 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center bottom, rgba(0,212,255,0.05) 0%, transparent 70%)' }}
        >
            <div
                className="pointer-events-auto animate-fade-in-up"
                style={{
                    background: 'rgba(10,10,26,0.92)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(0,212,255,0.25)',
                    borderRadius: '1rem',
                    padding: '1.25rem 1.5rem',
                    width: 340,
                    boxShadow: '0 0 32px rgba(0,212,255,0.15)',
                }}
            >
                <div className="flex items-start gap-3 mb-3">
                    <span style={{ fontSize: 28 }}>{current.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div
                            className="font-mono text-sm font-bold mb-1"
                            style={{ color: 'var(--accent-blue)' }}
                        >
                            {current.title}
                        </div>
                        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {current.body}
                        </div>
                    </div>
                </div>

                {/* Step dots */}
                <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-1.5">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: i === step ? 16 : 6,
                                    height: 6,
                                    borderRadius: 3,
                                    background: i === step ? 'var(--accent-blue)' : 'rgba(255,255,255,0.15)',
                                    transition: 'width 0.2s, background 0.2s',
                                }}
                            />
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSkip}
                            className="font-mono text-xs px-3 py-1 rounded-md cursor-pointer"
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'var(--text-muted)',
                            }}
                        >
                            Hopp over
                        </button>
                        <button
                            onClick={handleNext}
                            className="font-mono text-xs px-4 py-1 rounded-md font-bold cursor-pointer"
                            style={{
                                background: 'rgba(0,212,255,0.15)',
                                border: '1px solid rgba(0,212,255,0.4)',
                                color: 'var(--accent-blue)',
                            }}
                        >
                            {isLast ? 'Kom i gang' : 'Neste →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
