export async function requestOcrPageText(input: {
  imageUrl: string;
  signal?: AbortSignal;
  force?: boolean;
}) {
  const params = new URLSearchParams({ image: input.imageUrl });
  if (input.force) {
    params.set('skipCache', '1');
  }
  const response = await fetch(`/api/page-text?${params.toString()}`, {
    signal: input.signal
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}
