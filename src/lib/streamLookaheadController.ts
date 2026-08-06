export type StreamLookaheadSegment = {
  text: string;
  pageKey: string;
  pauseAfterMs?: number;
};

export type StreamLookaheadPageSegment = StreamLookaheadSegment & {
  pageIndex: number | null;
};

type ScrollBuffer = {
  runId: number;
  voice: string;
  nextPageIndex: number;
  pendingSegments: StreamLookaheadPageSegment[];
  queuedAheadPages: number;
  lastActivePageIndex: number | null;
  filling: boolean;
};

type ParagraphBuffer = {
  runId: number;
  voice: string;
  pendingSegments: StreamLookaheadSegment[];
  queuedAhead: number;
  lastActivePageKey: string | null;
};

export type StreamLookaheadEnvironment<PageText> = {
  manifest: string[];
  isRunCurrent: (runId: number) => boolean;
  getPageText: (imageUrl: string) => PageText | null;
  getPageSegments: (
    pageText: PageText,
    imageUrl: string,
    pageIndex: number
  ) => StreamLookaheadPageSegment[];
  getImageUrlFromPageKey: (pageKey: string) => string | null;
  enqueue: (segment: StreamLookaheadSegment, voice: string) => void;
};

export class StreamLookaheadController<PageText> {
  private scrollBuffer: ScrollBuffer | null = null;
  private paragraphBuffer: ParagraphBuffer | null = null;
  private readonly scrollLookahead: number;
  private readonly paragraphLookahead: number;

  constructor(scrollLookahead = 2, paragraphLookahead = 2) {
    this.scrollLookahead = scrollLookahead;
    this.paragraphLookahead = paragraphLookahead;
  }

  startScroll(config: {
    runId: number;
    voice: string;
    nextPageIndex: number;
    pendingSegments: StreamLookaheadPageSegment[];
    lastActivePageIndex: number | null;
  }) {
    this.scrollBuffer = {
      ...config,
      pendingSegments: [...config.pendingSegments],
      queuedAheadPages: 0,
      filling: false
    };
    this.paragraphBuffer = null;
  }

  startParagraph(config: {
    runId: number;
    voice: string;
    pendingSegments: StreamLookaheadSegment[];
    lastActivePageKey: string | null;
  }) {
    this.paragraphBuffer = {
      ...config,
      pendingSegments: [...config.pendingSegments],
      queuedAhead: 0
    };
    this.scrollBuffer = null;
  }

  clear() {
    this.scrollBuffer = null;
    this.paragraphBuffer = null;
  }

  suppressForStudy(manifestLength: number) {
    if (this.scrollBuffer) {
      this.scrollBuffer.pendingSegments = [];
      this.scrollBuffer.nextPageIndex = manifestLength;
    }
    if (this.paragraphBuffer) {
      this.paragraphBuffer.pendingSegments = [];
    }
  }

  get scrollRunId() {
    return this.scrollBuffer?.runId ?? null;
  }

  fillParagraph(
    runId: number,
    environment: Pick<StreamLookaheadEnvironment<PageText>, 'isRunCurrent' | 'enqueue'>
  ) {
    const buffer = this.paragraphBuffer;
    if (!buffer || buffer.runId !== runId) {
      return;
    }
    while (
      environment.isRunCurrent(runId) &&
      buffer.queuedAhead < this.paragraphLookahead &&
      buffer.pendingSegments.length > 0
    ) {
      const nextSegment = buffer.pendingSegments.shift();
      if (!nextSegment) {
        continue;
      }
      environment.enqueue(nextSegment, buffer.voice);
      buffer.queuedAhead += 1;
    }
  }

  fillScroll(runId: number, environment: StreamLookaheadEnvironment<PageText>) {
    const buffer = this.scrollBuffer;
    if (!buffer || buffer.runId !== runId || buffer.filling) {
      return;
    }
    buffer.filling = true;
    try {
      while (buffer.pendingSegments.length > 0) {
        const nextSegment = buffer.pendingSegments.shift();
        if (nextSegment) {
          environment.enqueue(nextSegment, buffer.voice);
        }
      }

      while (
        environment.isRunCurrent(runId) &&
        buffer.queuedAheadPages < this.scrollLookahead &&
        buffer.nextPageIndex < environment.manifest.length
      ) {
        const pageIndex = buffer.nextPageIndex;
        const imageUrl = environment.manifest[pageIndex];
        if (!imageUrl) {
          buffer.nextPageIndex += 1;
          continue;
        }
        const pageText = environment.getPageText(imageUrl);
        if (!pageText) {
          break;
        }
        buffer.nextPageIndex += 1;
        const pageSegments = environment.getPageSegments(pageText, imageUrl, pageIndex);
        if (pageSegments.length === 0) {
          continue;
        }
        pageSegments.forEach((segment) => environment.enqueue(segment, buffer.voice));
        buffer.queuedAheadPages += 1;
      }
    } finally {
      const latest = this.scrollBuffer;
      if (latest?.runId === runId) {
        latest.filling = false;
      }
    }
  }

  handleSegmentStart(pageKey: string, environment: StreamLookaheadEnvironment<PageText>) {
    const scrollBuffer = this.scrollBuffer;
    if (scrollBuffer) {
      const imageUrl = environment.getImageUrlFromPageKey(pageKey);
      const activePageIndex = imageUrl ? environment.manifest.indexOf(imageUrl) : -1;
      if (activePageIndex >= 0 && activePageIndex !== scrollBuffer.lastActivePageIndex) {
        scrollBuffer.lastActivePageIndex = activePageIndex;
        scrollBuffer.queuedAheadPages = Math.max(0, scrollBuffer.queuedAheadPages - 1);
        this.fillScroll(scrollBuffer.runId, environment);
      }
    }

    const paragraphBuffer = this.paragraphBuffer;
    if (paragraphBuffer && pageKey !== paragraphBuffer.lastActivePageKey) {
      paragraphBuffer.lastActivePageKey = pageKey;
      paragraphBuffer.queuedAhead = Math.max(0, paragraphBuffer.queuedAhead - 1);
      this.fillParagraph(paragraphBuffer.runId, environment);
    }
  }
}
