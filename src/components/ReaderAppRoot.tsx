import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { useReaderFeatureRuntime } from '@/hooks/useReaderFeatureRuntime';
import { useReaderShellControls } from '@/hooks/useReaderShellControls';
import { ReaderShellProvider, useReaderShell } from '@/hooks/useReaderShellContext';

export default function ReaderAppRoot() {
  const shellControls = useReaderShellControls();
  useReaderFeatureRuntime();
  useReaderAudioControls();

  return (
    <ReaderShellProvider value={shellControls}>
      <ReaderAppLayout />
    </ReaderShellProvider>
  );
}

function ReaderAppLayout() {
  const { isFullscreen } = useReaderShell();
  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar />
      <ReaderMainContent />
      <ReaderModalLayer />
    </div>
  );
}
