import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import ConfirmationModal from '@/components/ConfirmationModal';

type ConfirmationOptions = {
  action: () => Promise<void>;
  confirmLabel: string;
  description: string;
  title: string;
};

type PendingConfirmation = ConfirmationOptions & {
  resolve: () => void;
};

type ConfirmationContextValue = {
  confirmAction: (options: ConfirmationOptions) => Promise<void>;
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function useConfirmation() {
  const value = useContext(ConfirmationContext);
  if (!value) {
    throw new Error('useConfirmation must be used inside ConfirmationProvider');
  }
  return value;
}

export default function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const closePending = useCallback(() => {
    if (busy) {
      return;
    }
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve();
  }, [busy]);

  const confirmAction = useCallback((options: ConfirmationOptions) => {
    pendingRef.current?.resolve();
    return new Promise<void>((resolve) => {
      const request = { ...options, resolve };
      pendingRef.current = request;
      setBusy(false);
      setPending(request);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    const current = pendingRef.current;
    if (!current || busy) {
      return;
    }
    setBusy(true);
    try {
      await current.action();
    } finally {
      if (pendingRef.current === current) {
        pendingRef.current = null;
        setPending(null);
      }
      setBusy(false);
      current.resolve();
    }
  }, [busy]);

  useEffect(() => () => {
    pendingRef.current?.resolve();
    pendingRef.current = null;
  }, []);

  return (
    <ConfirmationContext.Provider value={{ confirmAction }}>
      {children}
      {pending ? (
        <ConfirmationModal
          busy={busy}
          confirmLabel={pending.confirmLabel}
          onCancel={closePending}
          onConfirm={() => void handleConfirm()}
          title={pending.title}
        >
          <p className="confirmation-modal-copy">{pending.description}</p>
        </ConfirmationModal>
      ) : null}
    </ConfirmationContext.Provider>
  );
}
