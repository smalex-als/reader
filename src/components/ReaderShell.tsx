import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useReaderShellControls } from '@/hooks/useReaderShellControls';

export default function ReaderShell() {
  const shellControls = useReaderShellControls();
  const { isFullscreen } = shellControls;

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar />
      <ReaderMainContent shellControls={shellControls} />
      <ReaderModalLayer shellControls={shellControls} />
    </div>
  );
}
