"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={17} className="shrink-0 text-emerald-500" />,
  error: <XCircle size={17} className="shrink-0 text-red-500" />,
  warning: <AlertCircle size={17} className="shrink-0 text-amber-500" />,
  info: <Info size={17} className="shrink-0 text-blue-500" />,
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: "border-emerald-200 dark:border-emerald-800/60",
  error: "border-red-200 dark:border-red-800/60",
  warning: "border-amber-200 dark:border-amber-800/60",
  info: "border-blue-200 dark:border-blue-800/60",
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, 4000);
    return () => {
      cancelAnimationFrame(enter);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onRemove]);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => onRemove(toast.id), 300);
  };

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lg transition-all duration-300 dark:bg-slate-900",
        BORDER_COLORS[toast.type],
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      role="alert"
    >
      {ICONS[toast.type]}
      <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">
        {toast.message}
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
        aria-label="Fechar"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);
  const warning = useCallback((message: string) => toast(message, "warning"), [toast]);
  const info = useCallback((message: string) => toast(message, "info"), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {/* Portal de toasts */}
      <div className="pointer-events-none fixed right-4 top-20 z-[9999] flex w-full max-w-sm flex-col gap-2 sm:right-6">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
