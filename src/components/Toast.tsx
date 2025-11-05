import type { ToastMessage } from '@/types/app';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast-${toast.kind ?? 'info'}`} role="status" onClick={onDismiss}>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
