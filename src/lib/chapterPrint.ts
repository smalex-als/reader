const PRINT_STYLES = `
  @page { size: auto; margin: 18mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; background: #fff; font: 11pt/1.5 Georgia, "Times New Roman", serif; overflow-wrap: anywhere; }
  header { margin-bottom: 7mm; padding-bottom: 4mm; border-bottom: 1px solid #bbb; }
  header p { margin: 0 0 2mm; color: #555; font: 9pt/1.4 Arial, sans-serif; }
  header h1 { margin: 0 0 2mm; font-size: 21pt; line-height: 1.2; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; margin: 1.2em 0 0.5em; }
  h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; }
  h4, h5, h6 { font-size: 11pt; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 0 0 0.8em; }
  ul, ol { padding-left: 1.5em; margin: 0 0 1em; }
  li { margin-bottom: 0.3em; }
  li > p { margin-bottom: 0.3em; }
  blockquote, .text-viewer-note { margin: 1em 0; padding-left: 1em; border-left: 2px solid #aaa; }
  a { color: inherit; text-decoration: underline; }
  code { font: 9pt/1.4 monospace; }
  pre { white-space: pre-wrap; padding: 3mm; border: 1px solid #ddd; }
  pre code { white-space: inherit; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 10pt; }
  th, td { padding: 2mm; border: 1px solid #aaa; vertical-align: top; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  img { max-width: 100%; height: auto; break-inside: avoid; }
  hr { border: 0; border-top: 1px solid #aaa; margin: 1em 0; }
`;

type ChapterPrintOptions = {
  content: HTMLElement;
  bookId: string;
  chapterNumber: number;
  chapterTitle: string;
  versionLabel: string;
};

/** Print a snapshot of the rendered version, without changing the reader's DOM. */
export async function printChapter({ content, bookId, chapterNumber, chapterTitle, versionLabel }: ChapterPrintOptions) {
  const snapshot = content.cloneNode(true) as HTMLElement;
  // Remove playback wrappers, keeping the Markdown's semantic elements intact.
  snapshot.querySelectorAll('div.text-viewer-block, div.text-viewer-list-block').forEach((block) => {
    block.replaceWith(...Array.from(block.childNodes));
  });
  snapshot.querySelectorAll('[data-voice], [data-playing]').forEach((block) => {
    block.removeAttribute('data-voice');
    block.removeAttribute('data-playing');
  });

  const frame = document.createElement('iframe');
  frame.title = 'Printable chapter';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:600px;border:0;';
  document.body.append(frame);

  try {
    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
      throw new Error('Unable to open the chapter for printing.');
    }
    printDocument.title = `${bookId} - ${chapterTitle} - ${versionLabel}`;
    printDocument.documentElement.lang = document.documentElement.lang;
    const base = printDocument.createElement('base');
    base.href = document.baseURI;
    const style = printDocument.createElement('style');
    style.textContent = PRINT_STYLES;
    printDocument.head.append(base, style);
    const header = printDocument.createElement('header');
    const book = printDocument.createElement('p');
    book.textContent = `${bookId} · Chapter ${chapterNumber}`;
    const heading = printDocument.createElement('h1');
    heading.textContent = chapterTitle;
    const version = printDocument.createElement('p');
    version.textContent = `Version: ${versionLabel}`;
    header.append(book, heading, version);
    printDocument.body.append(header, snapshot);

    let imageTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(Array.from(printDocument.images, (image) => image.decode().catch(() => undefined))),
        new Promise<never>((_resolve, reject) => {
          imageTimeout = setTimeout(() => reject(new Error('Chapter images are still loading. Try printing again.')), 15000);
        })
      ]);
    } finally {
      clearTimeout(imageTimeout);
    }
    await printDocument.fonts.ready;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
