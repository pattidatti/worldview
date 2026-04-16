import { useState, useEffect } from 'react';

interface ToastMessage {
    id: string;
    text: string;
    type: 'error' | 'info';
}

const listeners = new Set<(toast: ToastMessage) => void>();

export function addToast(text: string, type: 'error' | 'info' = 'error') {
    const toast: ToastMessage = { id: crypto.randomUUID(), text, type };
    listeners.forEach((fn) => fn(toast));
}

export function ToastContainer() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    useEffect(() => {
        const handler = (toast: ToastMessage) => {
            setToasts((prev) => [...prev, toast]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, 5000);
        };
        listeners.add(handler);
        return () => { listeners.delete(handler); };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-20 left-6 z-30 flex flex-col gap-2 max-w-80">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className="bg-[var(--bg-ui)] backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 shadow-2xl animate-[slide-in-right_0.3s_ease-out]"
                    style={{ borderLeftWidth: 3, borderLeftColor: toast.type === 'error' ? '#ff4444' : 'var(--accent-blue)' }}
                >
                    <p className="text-sm text-[var(--text-secondary)]">{toast.text}</p>
                </div>
            ))}
        </div>
    );
}
