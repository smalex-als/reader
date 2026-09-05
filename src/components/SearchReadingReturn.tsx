import CloseIcon from '@/components/CloseIcon';
import ReaderIcon from '@/components/ReaderIcon';
import { useSearchResultNavigation } from '@/hooks/useSearchResultNavigation';

export default function SearchReadingReturn({ onBeforeAction }: { onBeforeAction?: () => void }) {
  const { readingPosition, readingPositionLabel, returnToReading, keepReadingHere } = useSearchResultNavigation();
  if (!readingPosition) {
    return null;
  }
  return (
    <div className="search-reading-return" aria-label="Return from search">
      <button
        type="button"
        className="button button-ghost search-reading-return-button"
        onClick={() => {
          onBeforeAction?.();
          returnToReading();
        }}
        title={`Return to ${readingPositionLabel.toLowerCase()} in ${readingPosition.viewMode} mode`}
      >
        <ReaderIcon name="chevron-left" />
        <span>Back to reading <span className="search-reading-return-location">· {readingPositionLabel}</span></span>
      </button>
      <button
        type="button"
        className="button button-ghost modal-icon-button"
        aria-label="Keep reading here"
        title="Keep reading here"
        onClick={() => {
          onBeforeAction?.();
          keepReadingHere();
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
