import AppModals from '@/components/AppModals';
import { useReaderShell } from '@/hooks/useReaderShellContext';

export default function ReaderModalLayer() {
  const { isFullscreen, modalHostRef } = useReaderShell();

  return <AppModals portalTarget={isFullscreen ? modalHostRef.current : null} />;
}
