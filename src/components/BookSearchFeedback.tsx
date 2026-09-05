import type { SearchWorkflowState } from '@/state/appState';

type Props = {
  status: SearchWorkflowState['status'];
  query: string;
  submittedQuery: string;
  resultCount: number;
  onRetry: () => void;
};

export default function BookSearchFeedback({ status, query, submittedQuery, resultCount, onRetry }: Props) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {status === 'idle' ? (
        <p className="modal-status">
          {query.trim() ? 'Press Enter or Search to find matches.' : 'Enter a term or phrase to search this book.'}
        </p>
      ) : null}
      {status === 'loading' ? (
        <p className="modal-status">Searching for “{submittedQuery}”…</p>
      ) : null}
      {status === 'success' ? (
        <p className="modal-status">
          {resultCount === 0
            ? `No matches found for “${submittedQuery}”.`
            : `Showing ${resultCount} ${resultCount === 1 ? 'result' : 'results'} for “${submittedQuery}”.`}
        </p>
      ) : null}
      {status === 'error' ? (
        <div>
          <p className="modal-status">Unable to search for “{submittedQuery}”. Please try again.</p>
          <button type="button" className="button button-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}
