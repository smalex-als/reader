import AppModals from '@/components/AppModals';
import type { ReaderShellControls } from '@/hooks/useReaderShellControls';

type ReaderModalLayerProps = {
  shellControls: Pick<ReaderShellControls, 'isFullscreen' | 'modalHostRef'>;
};

export default function ReaderModalLayer({
  shellControls
}: ReaderModalLayerProps) {
  const { isFullscreen, modalHostRef } = shellControls;
  return <AppModals portalTarget={isFullscreen ? modalHostRef.current : null} />;
}
