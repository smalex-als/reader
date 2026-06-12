import ReaderShell from '@/components/ReaderShell';
import { useBookLibrarySession } from '@/hooks/useBookLibrarySession';
import { useBookOpenTracking } from '@/hooks/useBookOpenTracking';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookUrlSession } from '@/hooks/useBookUrlSession';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { useViewerSettingsSession } from '@/hooks/useViewerSettingsSession';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

export default function ReaderAppRoot() {
  useBookLibrarySession();
  useBookSession();
  useBookUrlSession();
  useBookOpenTracking();
  useViewerSettingsSession();
  useUnitsRouteSync();
  useOcrEditMode();
  useDashboardNavigation();
  useShareLink();
  useHotkeys();
  useReaderAudioControls();

  return <ReaderShell />;
}
