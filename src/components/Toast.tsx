import { useToast } from '@/hooks/useToast';

export default function Toast() {
  const { toast, dismiss } = useToast();

  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast-${toast.kind ?? 'info'}`} role="status" onClick={dismiss}>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
