export type ReaderIconName =
  | 'audio'
  | 'bookmark'
  | 'bookmarks'
  | 'book'
  | 'chevron-left'
  | 'chevron-right'
  | 'dashboard'
  | 'headphones'
  | 'more'
  | 'pages'
  | 'play'
  | 'reader'
  | 'scroll'
  | 'search'
  | 'settings'
  | 'stop'
  | 'text'
  | 'toc'
  | 'units';

const ICON_PATHS: Record<ReaderIconName, string[]> = {
  audio: ['M5 15h4l5 4V5L9 9H5v6Z', 'M17 9a4 4 0 0 1 0 6'],
  bookmark: ['M7 4h10v16l-5-3-5 3V4Z', 'M12 8v6M9 11h6'],
  bookmarks: ['M6 5h10v15l-5-3-5 3V5Z', 'M9 3h10v15'],
  book: ['M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3 3V4Z', 'M5 4v19'],
  'chevron-left': ['M15 6 9 12l6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  dashboard: ['M5 19V9M12 19V5M19 19v-7'],
  headphones: ['M4 13v5a2 2 0 0 0 2 2h2v-7H4Z', 'M16 13v7h2a2 2 0 0 0 2-2v-5h-4Z', 'M4 13a8 8 0 0 1 16 0'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  pages: ['M7 4h10v16H7z', 'M10 8h4M10 12h4M10 16h3'],
  play: ['M8 5v14l11-7-11-7Z'],
  reader: ['M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23V5.5Z', 'M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23V5.5Z'],
  scroll: ['M7 4h10v6a3 3 0 0 1-3 3H7V4Z', 'M7 13h10v7H7z'],
  search: ['M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z', 'M15.5 15.5 20 20'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7'],
  stop: ['M7 7h10v10H7z'],
  text: ['M5 6h14M8 6v12M16 6v12M5 18h14'],
  toc: ['M8 6h11M8 12h11M8 18h11', 'M4 6h.01M4 12h.01M4 18h.01'],
  units: ['M5 5h6v6H5z', 'M13 5h6v6h-6z', 'M5 13h6v6H5z', 'M13 13h6v6h-6z']
};

export default function ReaderIcon({ name }: { name: ReaderIconName }) {
  return (
    <svg className="reader-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
