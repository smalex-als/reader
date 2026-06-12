export async function createBookPrintPdf(input: {
  bookId: string;
  pages: string[];
  fallbackFilename: string;
}) {
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pages: input.pages })
  });
  if (!response.ok) {
    throw new Error('Failed to generate PDF');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const filename = match?.[1] || input.fallbackFilename;
  return {
    blob: await response.blob(),
    filename
  };
}
