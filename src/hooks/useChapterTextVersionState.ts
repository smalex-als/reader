import { useMemo, useState } from 'react';
import type { AudioJobStatus } from '@/hooks/chapterTextVersionActions';
import {
  getChapterTextVersionDisplayState,
  selectChapterTextVersion
} from '@/hooks/chapterTextVersionState';
import { getChapterVersionFromLocation } from '@/lib/bookUrl';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

type ChapterTextVersionStateParams = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: {
    start: number;
    end: number;
  } | null;
};

export function useChapterTextVersionState({
  bookId,
  chapterNumber,
  chapterRange
}: ChapterTextVersionStateParams) {
  const [chapterText, setChapterText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextVersionId, setSelectedTextVersionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ChapterTextVersion[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<ChapterTextPrompt[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState(
    () => getChapterVersionFromLocation() ?? 'base'
  );
  const [loading, setLoading] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioDeleting, setAudioDeleting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterAudioVersionId, setChapterAudioVersionId] = useState<string | null>(null);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [chapterAudioSubchapters, setChapterAudioSubchapters] = useState<FloatingAudioSubchapter[]>([]);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);

  const selectedVersion = useMemo(
    () => selectChapterTextVersion(versions, selectedVersionId),
    [selectedVersionId, versions]
  );
  const { displayText, displayLoading, displayError } = getChapterTextVersionDisplayState({
    bookId,
    chapterNumber,
    selectedVersionId,
    selectedVersion,
    selectedTextVersionId,
    chapterText,
    selectedText,
    loading,
    versionLoading,
    error,
    versionError
  });
  const canGenerate = Boolean(bookId && chapterNumber && chapterRange);
  const canCreateVersion = Boolean(bookId && chapterNumber && chapterText && !missingFile && !loading);
  const canGenerateAudio = Boolean(bookId && chapterNumber && displayText && !displayLoading);
  const isAudioJobActive = audioJob?.status === 'queued' || audioJob?.status === 'running';

  return {
    state: {
      chapterText,
      selectedText,
      selectedTextVersionId,
      versions,
      promptLibrary,
      selectedVersionId,
      loading,
      versionLoading,
      generating,
      error,
      missingFile,
      versionError,
      localRefreshToken,
      audioGenerating,
      audioDeleting,
      audioError,
      versionSaving,
      versionStatus,
      chapterAudioReady,
      chapterAudioVersionId,
      chapterAudioUrl,
      chapterAudioSubchapters,
      audioJob
    },
    publicState: {
      chapterText,
      displayText,
      displayLoading,
      displayError,
      versions,
      selectedVersion,
      selectedVersionId,
      generating,
      canGenerate,
      missingFile,
      audioGenerating,
      audioDeleting,
      audioError,
      versionSaving,
      versionStatus,
      chapterAudioReady,
      chapterAudioVersionId,
      chapterAudioUrl,
      chapterAudioSubchapters,
      audioJob,
      isAudioJobActive,
      canCreateVersion,
      canGenerateAudio
    },
    setters: {
      setChapterText,
      setSelectedText,
      setSelectedTextVersionId,
      setVersions,
      setPromptLibrary,
      setSelectedVersionId,
      setLoading,
      setVersionLoading,
      setGenerating,
      setError,
      setMissingFile,
      setVersionError,
      setLocalRefreshToken,
      setAudioGenerating,
      setAudioDeleting,
      setAudioError,
      setVersionSaving,
      setVersionStatus,
      setChapterAudioReady,
      setChapterAudioVersionId,
      setChapterAudioUrl,
      setChapterAudioSubchapters,
      setAudioJob
    },
    setterGroups: {
      status: {
        setLoading,
        setVersionLoading,
        setGenerating,
        setAudioGenerating,
        setAudioDeleting,
        setVersionSaving,
        setError,
        setVersionError,
        setAudioError,
        setVersionStatus,
        setMissingFile
      },
      loadStatus: {
        setLoading,
        setVersionLoading,
        setError,
        setMissingFile,
        setVersionError,
        setAudioGenerating,
        setAudioError,
        setVersionSaving,
        setVersionStatus
      },
      text: {
        setChapterText,
        setSelectedText,
        setSelectedTextVersionId
      },
      versions: {
        setVersions,
        setPromptLibrary,
        setSelectedVersionId
      },
      audio: {
        setChapterAudioReady,
        setChapterAudioVersionId,
        setChapterAudioUrl,
        setChapterAudioSubchapters,
        setAudioJob
      }
    },
    derived: {
      selectedVersion,
      displayText,
      displayLoading,
      displayError,
      canGenerate,
      canCreateVersion,
      canGenerateAudio,
      isAudioJobActive
    }
  };
}
