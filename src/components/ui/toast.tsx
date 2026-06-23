'use client';

import { create } from 'zustand';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cn } from './primitives';

/* ==========================================================================
   Mission Control — Toast system
   A lightweight, dependency-free toast store with a portal-mounted Toaster.
   Usage:
     import { toast } from '@/components/ui/toast';
     toast.success('Quest completed');
     toast.error('Failed to delete report');
   Mount <Toaster /> once near the app root (done in providers.tsx).
   ========================================================================== */

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ tone, title, description, duration = 4200 }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { id, tone, title, description, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'info', title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: 'warning', title, description }),
};

const toneConfig: Record<
  ToastTone,
  { icon: typeof CheckCircle2; ring: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    ring: 'border-emerald-400/24',
    iconColor: 'text-emerald-300',
  },
  error: { icon: XCircle, ring: 'border-rose-400/24', iconColor: 'text-rose-300' },
  info: { icon: Info, ring: 'border-blue-400/24', iconColor: 'text-blue-300' },
  warning: {
    icon: AlertTriangle,
    ring: 'border-amber-400/24',
    iconColor: 'text-amber-300',
  },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 mc-z-toast flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => {
        const cfg = toneConfig[t.tone];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-[linear-gradient(180deg,rgba(22,26,38,0.98),rgba(14,17,25,0.98))] px-4 py-3 mc-shadow-lg mc-animate-fade-in-up',
              cfg.ring,
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cfg.iconColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
