import ReaderShell from '@/components/ReaderShell';
import { useBookSession } from '@/hooks/useBookSession';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

export default function ReaderAppRoot() {
  useBookSession();
  useUnitsRouteSync();
  useOcrEditMode();
  useDashboardNavigation();
  useShareLink();
  useHotkeys();
  useReaderAudioControls();

  return <ReaderShell />;
}
