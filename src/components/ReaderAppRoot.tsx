import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useBookSession } from '@/hooks/useBookSession';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { useReaderShellControls, type ReaderShellControls } from '@/hooks/useReaderShellControls';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

export default function ReaderAppRoot() {
  const shellControls = useReaderShellControls();
  useBookSession();
  useUnitsRouteSync();
  useOcrEditMode();
  useDashboardNavigation();
  useShareLink();
  useHotkeys();
  useReaderAudioControls();

  return (
    <ReaderAppLayout shellControls={shellControls} />
  );
}

function ReaderAppLayout({
  shellControls
}: {
  shellControls: ReaderShellControls;
}) {
  const { isFullscreen } = shellControls;
  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar />
      <ReaderMainContent shellControls={shellControls} />
      <ReaderModalLayer shellControls={shellControls} />
    </div>
  );
}
