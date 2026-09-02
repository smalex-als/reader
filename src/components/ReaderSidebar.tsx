import ReaderIcon from '@/components/ReaderIcon';
import {
  appActions,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function ReaderSidebar() {
  const dispatch = useAppDispatch();
  const { bookId: currentBook } = useAppSelector(selectReaderSession);
  const { mainView } = useAppSelector(selectNavigationState);
  const readerOpen = mainView === 'reader';
  const audioLibraryOpen = mainView === 'audio-library';
  const unitsLibraryOpen = mainView === 'units';

  const openBookSelect = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('bookSelect'));
  };
  const openReader = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('reader'));
  };
  const openAudioLibrary = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('audio-library'));
  };
  const openUnits = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setSelectedUnitSetId(null));
    dispatch(appActions.setSelectedUnitTopicId(null));
    dispatch(appActions.setMainView('units'));
  };

  return (
    <aside
      className={`reader-sidebar reader-sidebar-collapsed reader-sidebar-slim ${
        readerOpen ? 'reader-sidebar-view-reader' : ''
      }`}
      aria-label="Reader navigation"
    >
      <div className="reader-sidebar-scroll">
        <div className="reader-sidebar-section reader-sidebar-primary">
          <button
            type="button"
            className="reader-sidebar-action"
            onClick={openBookSelect}
            aria-label={currentBook ? 'Change book' : 'Select book'}
            aria-keyshortcuts="B"
            title={`${currentBook ? 'Change book' : 'Select book'} (B)`}
            data-tooltip={`${currentBook ? 'Change book' : 'Select book'} · B`}
          >
            <ReaderIcon name="book" />
          </button>
          <button
            type="button"
            className={`reader-sidebar-action ${readerOpen ? 'reader-sidebar-action-active' : ''}`}
            onClick={openReader}
            aria-label="Reader"
            aria-current={readerOpen ? 'page' : undefined}
            title="Reader"
            data-tooltip="Reader"
          >
            <ReaderIcon name="reader" />
          </button>
          <button
            type="button"
            className={`reader-sidebar-action ${audioLibraryOpen ? 'reader-sidebar-action-active' : ''}`}
            onClick={openAudioLibrary}
            aria-label="MP3 Library"
            aria-current={audioLibraryOpen ? 'page' : undefined}
            title="MP3 Library"
            data-tooltip="MP3 Library"
          >
            <ReaderIcon name="headphones" />
          </button>
          <button
            type="button"
            className={`reader-sidebar-action ${unitsLibraryOpen ? 'reader-sidebar-action-active' : ''}`}
            onClick={openUnits}
            aria-label="Units"
            aria-current={unitsLibraryOpen ? 'page' : undefined}
            title="Units"
            data-tooltip="Units"
          >
            <ReaderIcon name="units" />
          </button>
        </div>
      </div>

      <div className="reader-sidebar-footer">
        <button
          type="button"
          className="reader-sidebar-action"
          onClick={() => dispatch(appActions.openModal('settings'))}
          aria-label="Settings"
          aria-keyshortcuts=","
          title="Settings (,)"
          data-tooltip="Settings · ,"
        >
          <ReaderIcon name="settings" />
        </button>
      </div>
    </aside>
  );
}
