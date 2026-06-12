import { useBookSession } from '@/hooks/useBookSession';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

export function useReaderFeatureRuntime() {
  useBookSession();
  useUnitsRouteSync();
  useOcrEditMode();
  useDashboardNavigation();
  useShareLink();
  useHotkeys();
}
