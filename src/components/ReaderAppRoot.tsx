import ReaderShell from '@/components/ReaderShell';
import { useBookLibrarySession } from '@/hooks/useBookLibrarySession';
import { useBookManifestSession } from '@/hooks/useBookManifestSession';
import { useBookOpenTracking } from '@/hooks/useBookOpenTracking';
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
  useBookManifestSession();
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
