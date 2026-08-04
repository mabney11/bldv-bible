import { useEffect, useState, useCallback, createContext, useContext } from 'react';

const ToastCtx = createContext(null);

/** Mount once at app root; call useToast() from anywhere to push messages. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((msg, type = 'ok', ms = 2200) => {
    setToast({ msg, type });
    if (window._toastT) clearTimeout(window._toastT);
    window._toastT = setTimeout(() => setToast(null), ms);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast visible ${toast.type}`}>{toast.msg}</div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx) || (() => {});
}
