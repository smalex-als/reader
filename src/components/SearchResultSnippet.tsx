import { splitSearchHighlights } from '@/lib/searchHighlights';

export default function SearchResultSnippet({ text, query }: { text: string; query: string }) {
  return (
    <p className="search-result-snippet">
      {splitSearchHighlights(text, query).map((part, index) =>
        part.match ? <mark key={index} className="search-result-highlight">{part.text}</mark> : part.text
      )}
    </p>
  );
}
