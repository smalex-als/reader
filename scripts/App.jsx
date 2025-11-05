import React, { useLayoutEffect, useRef } from 'https://esm.sh/react@18';
import { initApp } from './main.js';

export default function App(){
  const appRef = useRef(null);

  useLayoutEffect(() => {
    if(!appRef.current){
      return undefined;
    }
    return initApp(appRef.current);
  }, []);

  return (
    <div className="app" id="app" ref={appRef}>
      <header>
        <div className="row">
          <div className="toolbar-group">
            <label className="hint">
              Book
              <select id="bookSelect" title="Choose a book from the server">
                <option value="">Loading…</option>
              </select>
            </label>
            <button className="btn" id="refreshBooksBtn" title="Reload book list">Reload</button>
            <button className="btn" id="toggleThumbs" title="Toggle thumbnails (T)">Thumbnails</button>
            <span className="sep"></span>
            <button className="btn" id="prevBtn" title="Previous (← / PgUp)">Prev</button>
            <button className="btn" id="nextBtn" title="Next (→ / PgDn / Space)">Next</button>
            <span className="hint page-counter" id="pageCounter">– / –</span>
          </div>

          <div className="toolbar-group">
            <button className="btn" id="fitWidthBtn" title="Fit width (W)">Fit W</button>
            <button className="btn" id="fitHeightBtn" title="Fit height (H)">Fit H</button>
            <button className="btn" id="resetZoomBtn" title="Reset zoom (0)">100%</button>
            <button className="btn" id="zoomOutBtn" title="Zoom out (-)">–</button>
            <button className="btn" id="zoomInBtn" title="Zoom in (+)">+</button>
            <span className="hint" id="zoomLabel">100%</span>
            <span className="sep"></span>
            <button className="btn" id="rotateBtn" title="Rotate 90° (R)">Rotate</button>
            <button className="btn" id="invertBtn" title="Toggle inverse colors (I)">Invert</button>
            <button className="btn" id="playBtn" title="Play text-to-speech (P)">Play</button>
            <button className="btn" id="textBtn" title="Show parsed text (X)">Text</button>
            <label className="hint">
              Brightness
              <input type="range" id="brightness" min="50" max="200" defaultValue="100" />
            </label>
            <label className="hint">
              Contrast
              <input type="range" id="contrast" min="50" max="200" defaultValue="100" />
            </label>
          </div>

          <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
            <label className="hint">
              Go to
              <input type="number" id="gotoInput" min="1" style={{ width: '5rem' }} />
              <button className="btn" id="gotoBtn" title="Go (G)">Go</button>
            </label>
            <button className="btn" id="fullBtn" title="Fullscreen (F)">Full</button>
            <span className="hint">
              Drag to pan • Scroll to move • I toggles invert • X shows text • P plays audio • Use Book menu to switch volumes
            </span>
          </div>
        </div>
      </header>

      <div className="viewer" id="viewer">
        <aside className="thumbs" id="thumbs"></aside>
        <div className="canvas-wrap" id="canvasWrap">
          <img id="page" className="page" alt="Page" />
        </div>
        <div id="toast" className="toast"></div>
      </div>
      <div className="modal" id="textModal" role="dialog" aria-modal="true" aria-labelledby="textModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title" id="textModalTitle">Page Text</div>
            <button className="modal-close" id="textModalClose" aria-label="Close text preview">×</button>
          </div>
          <div className="modal-body" id="textModalBody">Loading…</div>
        </div>
      </div>

      <footer>
        <div className="row">
          <div className="hint">Scanned Book Reader • Local-first • No uploads • Stores last page &amp; settings</div>
          <div className="hint" style={{ marginLeft: 'auto' }}>
            Shortcuts: ←/→ Prev/Next • +/- Zoom • 0 Reset • W/H Fit • R Rotate • I Invert • X Text • P Play • T Thumbs • G Go •{' '}
            F Fullscreen • Use Book menu to switch volumes
          </div>
        </div>
      </footer>
    </div>
  );
}
