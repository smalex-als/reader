import type { RefObject } from 'react';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

type UseReaderFeatureRuntimeOptions = {
  gotoInputRef: RefObject<HTMLInputElement>;
};

export function useReaderFeatureRuntime({
  gotoInputRef
}: UseReaderFeatureRuntimeOptions) {
  useUnitsRouteSync();
  useOcrEditMode();
  useDashboardNavigation();
  useShareLink();
  useHotkeys({
    gotoInputRef
  });
}
