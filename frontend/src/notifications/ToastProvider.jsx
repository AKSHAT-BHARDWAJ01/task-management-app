import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { shouldShowToast } from "./toastPolicy.js";

const ToastContext = createContext(null);

const DURATIONS = { success: 4000, info: 5000, warning: 6000, error: 8000 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 180);
  }, []);

  const push = useCallback((tone, message, options = {}) => {
    const now = Date.now();
    const next = { tone, message };
    if (!shouldShowToast(recentRef.current, next, now)) return;
    recentRef.current = [...recentRef.current, { ...next, at: now }].slice(-8);
    const id = now + Math.random();
    setToasts((current) => [...current, { id, tone, message, title: options.title, action: options.action }].slice(-4));
    const timer = window.setTimeout(() => dismiss(id), DURATIONS[tone] ?? 4000);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  const value = useMemo(() => ({
    success: (message, options) => push("success", message, options),
    info: (message, options) => push("info", message, options),
    warning: (message, options) => push("warning", message, options),
    error: (message, options) => push("error", message, options),
    dismiss,
  }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <article className={`toast toast-${toast.tone} ${toast.leaving ? "toast-leaving" : ""}`} key={toast.id} role={toast.tone === "error" ? "alert" : "status"}>
            <span className="toast-icon" aria-hidden="true">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : toast.tone === "warning" ? "●" : "i"}</span>
            <div>
              {toast.title && <strong>{toast.title}</strong>}
              <p>{toast.message}</p>
              {toast.action && <button type="button" onClick={() => { toast.action.onClick(); dismiss(toast.id); }}>{toast.action.label}</button>}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
