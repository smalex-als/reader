import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  appActions,
  selectChapterVersionNavigationRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ChapterTextVersion } from '@/types/app';

export function useChapterVersionNavigation() {
  const dispatch = useAppDispatch();
  const chapterVersionNavigationRequest = useAppSelector(selectChapterVersionNavigationRequest);

  const requestChapterVersionNavigation = useCallback(
    (chapterNumber: number, versionId: string) => {
      dispatch(appActions.requestChapterVersionNavigation(chapterNumber, versionId));
    },
    [dispatch]
  );

  const clearChapterVersionNavigation = useCallback(() => {
    dispatch(appActions.clearChapterVersionNavigation());
  }, [dispatch]);

  return {
    chapterVersionNavigationRequest,
    requestChapterVersionNavigation,
    clearChapterVersionNavigation
  };
}

export function useChapterVersionSelectionNavigation({
  bookId,
  chapterNumber,
  versions,
  selectedVersionId,
  setSelectedVersionId
}: {
  bookId: string | null;
  chapterNumber: number | null;
  versions: ChapterTextVersion[];
  selectedVersionId: string;
  setSelectedVersionId: Dispatch<SetStateAction<string>>;
}) {
  const dispatch = useAppDispatch();
  const versionNavigationRequest = useAppSelector(selectChapterVersionNavigationRequest);
  const [urlVersionReady, setUrlVersionReady] = useState(false);
  const appliedVersionNavigationRequestRef = useRef<number | null>(null);

  const handleVersionChange = useCallback(
    (nextVersionId: string) => {
      if (nextVersionId === selectedVersionId) {
        return;
      }
      dispatch(appActions.setFirstChapterParagraph(null));
      dispatch(appActions.setDisplayedChapterText(null));
      setSelectedVersionId(nextVersionId);
    },
    [dispatch, selectedVersionId, setSelectedVersionId]
  );

  useEffect(() => {
    setUrlVersionReady(false);
  }, [bookId, chapterNumber]);

  useEffect(() => {
    if (!versionNavigationRequest) {
      return;
    }
    if (appliedVersionNavigationRequestRef.current === versionNavigationRequest.id) {
      return;
    }
    if (chapterNumber !== versionNavigationRequest.chapterNumber) {
      return;
    }
    if (!versions.some((version) => version.id === versionNavigationRequest.versionId)) {
      return;
    }
    appliedVersionNavigationRequestRef.current = versionNavigationRequest.id;
    handleVersionChange(versionNavigationRequest.versionId);
    setUrlVersionReady(true);
  }, [chapterNumber, handleVersionChange, versionNavigationRequest, versions]);

  useEffect(() => {
    if (urlVersionReady || !chapterNumber || versions.length === 0) {
      return;
    }
    const requestedNavigationVersion =
      versionNavigationRequest?.chapterNumber === chapterNumber &&
      versions.some((version) => version.id === versionNavigationRequest.versionId)
        ? versionNavigationRequest.versionId
        : null;
    if (requestedNavigationVersion) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedVersionId = params.get('version')?.trim() || '';
    if (requestedVersionId && versions.some((version) => version.id === requestedVersionId)) {
      if (requestedVersionId !== selectedVersionId) {
        handleVersionChange(requestedVersionId);
        return;
      }
    }
    setUrlVersionReady(true);
  }, [
    chapterNumber,
    handleVersionChange,
    selectedVersionId,
    urlVersionReady,
    versionNavigationRequest,
    versions
  ]);

  useEffect(() => {
    if (!urlVersionReady || !chapterNumber) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const nextVersionId = selectedVersionId || 'base';
    if (params.get('version') === nextVersionId) {
      return;
    }
    params.set('version', nextVersionId);
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [chapterNumber, selectedVersionId, urlVersionReady]);

  return {
    handleVersionChange
  };
}
