'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;

  const bg: Record<ToastType, string> = {
    success: '#EFF8F2',
    error: '#FDF2F2',
    info: '#F0F4FF',
  };
  const border: Record<ToastType, string> = {
    success: '#B7E4C7',
    error: '#F5C6C6',
    info: '#C5D3F5',
  };
  const text: Record<ToastType, string> = {
    success: '#4A8C6A',
    error: '#A85454',
    info: '#4A6FA5',
  };

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          padding: '10px 18px', borderRadius: 'var(--radius-sm)',
          fontSize: '0.82rem', fontWeight: 500,
          background: bg[t.type],
          border: `1px solid ${border[t.type]}`,
          color: text[t.type],
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          animation: 'toastFadeIn 0.2s ease',
          pointerEvents: 'auto',
          maxWidth: 380,
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* Inject keyframe once — harmless if duplicated, but we keep it here for portability */
let _injected = false;
export function injectToastKeyframe() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes toastFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }';
  document.head.appendChild(style);
}
