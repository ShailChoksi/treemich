import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastMessage = {
  id: number;
  message: string;
};

type ToastContextValue = {
  toasts: ToastMessage[];
  status: string | null;
  addToast: (message: string) => void;
  setStatus: (message: string | null) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [status, setStatusState] = useState<string | null>(null);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message: string) => {
    const toastId = (toastIdRef.current += 1);
    setToasts((current) => [...current.slice(-2), { id: toastId, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, 5000);
  }, []);

  const setStatus = useCallback((message: string | null) => {
    setStatusState(message);
  }, []);

  useEffect(() => {
    if (!status) {
      return;
    }
    const toastId = toastIdRef.current + 1;
    addToast(status);
    const timeout = window.setTimeout(() => {
      setStatusState(null);
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [addToast, status]);

  const value = useMemo(
    () => ({ toasts, status, addToast, setStatus }),
    [addToast, setStatus, status, toasts]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};
