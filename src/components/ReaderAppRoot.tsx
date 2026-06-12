import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderRuntimeProvider from '@/components/ReaderRuntimeProvider';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useReaderShell } from '@/hooks/useReaderShellContext';

export default function ReaderAppRoot() {
  return (
    <ReaderRuntimeProvider>
      <ReaderAppLayout />
    </ReaderRuntimeProvider>
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
