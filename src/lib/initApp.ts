type ZoomMode = 'fit-width' | 'fit-height' | 'custom';

type PageEntry = {
  name: string;
  url: string;
};

type Pan = {
  x: number;
  y: number;
};

interface AppState {
  books: string[];
  bookId: string | null;
  imgs: PageEntry[];
  idx: number;
  zoom: number;
  zoomMode: ZoomMode;
  angle: number;
  invert: boolean;
  brightness: number;
  contrast: number;
  thumbsOpen: boolean;
  pan: Pan;
}

type StoredState = {
  bookId?: string | null;
  idx?: number;
  zoom?: number;
  zoomMode?: ZoomMode;
  invert?: boolean;
  brightness?: number;
  contrast?: number;
  thumbsOpen?: boolean;
};

type TextCacheEntry = {
  text: string;
  source: 'file' | 'ai' | 'none' | 'error';
};

type AudioCacheEntry = {
  url: string;
  source: 'file' | 'ai';
};

export function initApp(rootElement: HTMLElement | null): () => void {
  const containerBase = rootElement instanceof HTMLElement ? rootElement : document.getElementById('app');
  const container = containerBase instanceof HTMLElement ? containerBase : null;
  if(!container){
    console.error('Scanned Book Reader: app root element not found.');
    return () => {};
  }
  const $ = <T extends Element>(sel: string) => container.querySelector(sel) as T | null;
  const app: AppState = {
    books: [],
    bookId: null,
    imgs: [],
    idx: 0,
    zoom: 1,
    zoomMode: 'fit-width',
    angle: 0,
    invert: false,
    brightness: 100,
    contrast: 100,
    thumbsOpen: false,
    pan: { x: 0, y: 0 }
  };

  const pageImg = $<HTMLImageElement>('#page');
  const viewer = $<HTMLElement>('#viewer');
  const thumbs = $<HTMLElement>('#thumbs');
  const pageCounter = $<HTMLElement>('#pageCounter');
  const zoomLabel = $<HTMLElement>('#zoomLabel');
  const toast = $<HTMLElement>('#toast');
  const bookSelect = $<HTMLSelectElement>('#bookSelect');
  const refreshBooksBtn = $<HTMLButtonElement>('#refreshBooksBtn');
  const brightnessInput = $<HTMLInputElement>('#brightness');
  const contrastInput = $<HTMLInputElement>('#contrast');
  const gotoInput = $<HTMLInputElement>('#gotoInput');
  const invertBtn = $<HTMLButtonElement>('#invertBtn');
  const playBtn = $<HTMLButtonElement>('#playBtn');
  const textBtn = $<HTMLButtonElement>('#textBtn');
  const textModal = $<HTMLElement>('#textModal');
  const textModalTitle = $<HTMLElement>('#textModalTitle');
  const textModalBody = $<HTMLElement>('#textModalBody');
  const textModalClose = $<HTMLButtonElement>('#textModalClose');
  const nextBtn = $<HTMLButtonElement>('#nextBtn');
  const prevBtn = $<HTMLButtonElement>('#prevBtn');
  const toggleThumbsBtn = $<HTMLButtonElement>('#toggleThumbs');
  const fitWidthBtn = $<HTMLButtonElement>('#fitWidthBtn');
  const fitHeightBtn = $<HTMLButtonElement>('#fitHeightBtn');
  const zoomInBtn = $<HTMLButtonElement>('#zoomInBtn');
  const zoomOutBtn = $<HTMLButtonElement>('#zoomOutBtn');
  const resetZoomBtn = $<HTMLButtonElement>('#resetZoomBtn');
  const rotateBtn = $<HTMLButtonElement>('#rotateBtn');
  const gotoBtn = $<HTMLButtonElement>('#gotoBtn');
  const fullBtn = $<HTMLButtonElement>('#fullBtn');
  if(!pageImg || !viewer || !thumbs || !pageCounter || !zoomLabel || !toast || !bookSelect || !refreshBooksBtn || !brightnessInput || !contrastInput || !gotoInput || !invertBtn || !playBtn || !textBtn || !textModal || !textModalTitle || !textModalBody || !textModalClose || !nextBtn || !prevBtn || !toggleThumbsBtn || !fitWidthBtn || !fitHeightBtn || !zoomInBtn || !zoomOutBtn || !resetZoomBtn || !rotateBtn || !gotoBtn || !fullBtn){
    console.error('Scanned Book Reader: required DOM nodes not found.');
    return () => {};
  }
  textBtn.disabled = true;
  playBtn.disabled = true;

  const textCache = new Map<string, TextCacheEntry>();
  const audioCache = new Map<string, AudioCacheEntry>();
  const audioPlayer = new Audio();
  audioPlayer.preload = 'auto';
  audioPlayer.addEventListener('ended', ()=>{ playBtn.classList.remove('active'); audioPageKey = null; });
  audioPlayer.addEventListener('pause', ()=>{ playBtn.classList.remove('active'); });
  audioPlayer.addEventListener('play', ()=>{ playBtn.classList.add('active'); });
  audioPlayer.addEventListener('error', ()=>{ playBtn.classList.remove('active'); showToast('Audio playback failed'); });
  let audioPageKey: string | null = null;
  let modalOpen = false;
  const stateKey = 'scanned-book-reader:v1';
  let initialState = readState();
  applyState(initialState);

  function showToast(msg: string){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(()=> toast.classList.remove('show'), 1800);
  }
  function saveState(){
    try{
      localStorage.setItem(stateKey, JSON.stringify({
        bookId: app.bookId,
        idx: app.idx,
        zoom: app.zoom,
        zoomMode: app.zoomMode,
        invert: app.invert,
        brightness: app.brightness,
        contrast: app.contrast,
        thumbsOpen: app.thumbsOpen
      }));
    }catch(e){
      console.warn('Failed to persist reader state', e);
    }
  }

  function readState(): StoredState | null{
    try{
      return JSON.parse(localStorage.getItem(stateKey)||'null') as StoredState | null;
    }catch(e){
      return null;
    }
  }

  function applyState(state: StoredState | null){
    if(!state) return;
    if(typeof state.bookId === 'string' || state.bookId === null) app.bookId = state.bookId;
    if(typeof state.idx === 'number' && Number.isFinite(state.idx)) app.idx = Math.trunc(state.idx);
    if(typeof state.zoom === 'number' && Number.isFinite(state.zoom)) app.zoom = state.zoom;
    if(typeof state.zoomMode === 'string' && ['fit-width','fit-height','custom'].includes(state.zoomMode)){
      app.zoomMode = state.zoomMode as ZoomMode;
    }
    if(typeof state.brightness === 'number' && Number.isFinite(state.brightness)) app.brightness = state.brightness;
    if(typeof state.contrast === 'number' && Number.isFinite(state.contrast)) app.contrast = state.contrast;
    if(typeof state.thumbsOpen === 'boolean') app.thumbsOpen = state.thumbsOpen;
    if(typeof state.invert === 'boolean') app.invert = state.invert;
    brightnessInput.value = String(app.brightness);
    contrastInput.value = String(app.contrast);
    thumbs.classList.toggle('open', app.thumbsOpen);
    invertBtn.classList.toggle('active', app.invert);
    if(modalOpen) hideTextModal();
    applyFilters();
    updateTransform();
    updateCounter();
  }

  function snapshotState(): StoredState{
    return {
      bookId: app.bookId,
      idx: app.idx,
      zoom: app.zoom,
      zoomMode: app.zoomMode,
      invert: app.invert,
      brightness: app.brightness,
      contrast: app.contrast,
      thumbsOpen: app.thumbsOpen
    };
  }

  function updateCounter(){
    pageCounter.textContent = app.imgs.length? `${app.idx+1} / ${app.imgs.length}` : '– / –';
    zoomLabel.textContent = Math.round(app.zoom*100)+'%';
  }

  function renderThumbs(): void{
    thumbs.innerHTML = '';
    app.imgs.forEach((it,i)=>{
      const el = document.createElement('div');
      el.className = 'thumb'+(i===app.idx?' active':'');
      el.innerHTML = `<img loading="lazy" src="${it.url}" alt="${escapeHtml(it.name)}"/><div><div>${escapeHtml(it.name)}</div><div class="meta">${i+1}</div></div>`;
      el.addEventListener('click', ()=>{
        if(modalOpen) hideTextModal();
        app.idx = i;
        app.pan = {x:0, y:0};
        renderPage({recenter: true});
        saveState();
      });
      thumbs.appendChild(el);
    });
  }

  function escapeHtml(s: string): string{
    return s.replace(/[&<>"]+/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] ?? c));
  }

  function applyFilters(): void{
    const invertFilter = app.invert ? ' invert(1) hue-rotate(180deg)' : '';
    pageImg.style.filter = `brightness(${app.brightness}%) contrast(${app.contrast}%)${invertFilter}`;
    invertBtn.classList.toggle('active', app.invert);
  }

  function renderPage(options: { recenter?: boolean } = {}): void{
    const { recenter = false } = options;
    const hasPages = app.imgs.length > 0;
    textBtn.disabled = !hasPages;
    playBtn.disabled = !hasPages;
    if(!hasPages){
      stopAudio();
      pageImg.removeAttribute('src');
      updateCounter();
      return;
    }
    const src = app.imgs[app.idx].url;
    if(pageImg.getAttribute('src')!==src){ pageImg.src = src; }
    if(recenter){ app.pan = {x:0, y:0}; }
    applyFilters();
    applyZoomMode({ recenter });
    [...thumbs.children].forEach((el,i)=> el.classList.toggle('active', i===app.idx));
  }

  function applyZoomMode({ recenter = false }: { recenter?: boolean } = {}): boolean{
    const prevZoom = app.zoom;
    const prevPanX = app.pan.x;
    const prevPanY = app.pan.y;
    let zoomAdjusted = false;
    if(app.zoomMode === 'fit-width'){
      zoomAdjusted = computeFitWidth();
    }else if(app.zoomMode === 'fit-height'){
      zoomAdjusted = computeFitHeight();
    }
    if(app.zoomMode !== 'custom' && (recenter || zoomAdjusted)){
      if(app.pan.x !== 0 || app.pan.y !== 0){
        app.pan = {x:0, y:0};
      }
    }
    updateTransform();
    const changed = zoomAdjusted || app.zoom !== prevZoom || app.pan.x !== prevPanX || app.pan.y !== prevPanY;
    updateCounter();
    return changed;
  }

  function updateTransform(): void{
    clampPan();
    pageImg.style.transform = `translate(-50%, 0) translate(${app.pan.x}px, ${app.pan.y}px) rotate(${app.angle}deg) scale(${app.zoom})`;
  }

  function getViewportSize(): { width: number; height: number }{
    const width = Math.max(0, viewer.clientWidth - (app.thumbsOpen? 180 : 0));
    const height = Math.max(0, viewer.clientHeight);
    return { width, height };
  }

  function getContentSize(): { width: number; height: number }{
    if(!pageImg.naturalWidth || !pageImg.naturalHeight){
      return { width: 0, height: 0 };
    }
    const angle = ((app.angle % 360) + 360) % 360;
    const rotated = angle === 90 || angle === 270;
    const baseWidth = rotated ? pageImg.naturalHeight : pageImg.naturalWidth;
    const baseHeight = rotated ? pageImg.naturalWidth : pageImg.naturalHeight;
    const zoom = app.zoom || 1;
    return { width: baseWidth * zoom, height: baseHeight * zoom };
  }

  function clampPan(): void{
    if(!pageImg.naturalWidth || !pageImg.naturalHeight){
      app.pan.x = 0;
      app.pan.y = 0;
      return;
    }
    const { width: viewportW, height: viewportH } = getViewportSize();
    const { width: contentW, height: contentH } = getContentSize();
    const halfExtraX = Math.max(0, (contentW - viewportW) / 2);
    if(halfExtraX === 0){
      app.pan.x = 0;
    }else{
      app.pan.x = Math.max(-halfExtraX, Math.min(halfExtraX, app.pan.x));
    }
    const extraY = Math.max(0, contentH - viewportH);
    if(extraY === 0){
      app.pan.y = 0;
    }else{
      app.pan.y = Math.max(-extraY, Math.min(0, app.pan.y));
    }
  }

  function computeFitWidth(): boolean{
    if(!pageImg.naturalWidth || !pageImg.naturalHeight) return false;
    const { width: vw } = getViewportSize();
    if(vw <= 0) return false;
    const w = pageImg.naturalWidth; const h = pageImg.naturalHeight;
    const angle = ((app.angle%180)+180)%180;
    const rotated = angle===90;
    const rw = rotated? h:w;
    const rawZoom = (vw-24)/rw;
    const newZoom = Math.max(0.05, rawZoom);
    if(!Number.isFinite(newZoom) || Math.abs(newZoom - app.zoom) < 1e-3) return false;
    app.zoom = newZoom;
    return true;
  }

  function computeFitHeight(): boolean{
    if(!pageImg.naturalWidth || !pageImg.naturalHeight) return false;
    const { height: vh } = getViewportSize();
    if(vh <= 0) return false;
    const w = pageImg.naturalWidth; const h = pageImg.naturalHeight;
    const angle = ((app.angle%180)+180)%180;
    const rotated = angle===90;
    const rh = rotated? w:h;
    const rawZoom = (vh-24)/rh;
    const newZoom = Math.max(0.05, rawZoom);
    if(!Number.isFinite(newZoom) || Math.abs(newZoom - app.zoom) < 1e-3) return false;
    app.zoom = newZoom;
    return true;
  }

  function deriveTextUrl(imageUrl: string): string | null{
    if(!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) return null;
    try{
      const url = new URL(imageUrl, window.location.origin);
      const match = url.pathname.match(/^(.*)\.[^/.]+$/);
      if(!match) return null;
      url.pathname = match[1] + '.txt';
      return url.pathname + url.search;
    }catch(e){
      const match = imageUrl.match(/^(.*)\.[^/.]+$/);
      return match? match[1] + '.txt' : null;
    }
  }

  async function openTextPreview(): Promise<void>{
    if(!app.imgs.length){
      showToast('No page loaded');
      return;
    }
    if(modalOpen){
      hideTextModal();
      return;
    }
    const entry = app.imgs[app.idx];
    const cacheKey = entry.url;
    const cached = textCache.get(cacheKey);
    if(cached){
      const title = cached.source === 'ai' ? `${entry.name} • Generated` : entry.name;
      showTextModal(title, cached.text);
      if(cached.source === 'ai') showToast('Showing generated text');
      return;
    }
    const textUrl = deriveTextUrl(entry.url);
    showTextModal(entry.name, 'Loading…');
    try{
      const result = await loadPageText(entry, textUrl);
      if(!result){
        textCache.set(cacheKey, { text: 'Text not available for this page.', source: 'none' });
        textModalTitle.textContent = entry.name;
        setTextModalContent('Text not available for this page.');
        return;
      }
      textCache.set(cacheKey, result);
      textModalTitle.textContent = result.source === 'ai' ? `${entry.name} • Generated` : entry.name;
      setTextModalContent(result.text);
      if(result.source === 'ai'){
        showToast('Generated text with OpenAI');
      }
    }catch(err){
      console.error(err);
      textCache.set(cacheKey, { text: 'Text not available for this page.', source: 'error' });
      textModalTitle.textContent = entry.name;
      setTextModalContent('Text not available for this page.');
      showToast('Failed to load page text');
    }
  }

  async function loadPageText(entry: PageEntry, textUrl: string | null): Promise<TextCacheEntry | null>{
    if(textUrl){
      const res = await fetch(textUrl, { headers: { 'Accept': 'text/plain, text/*;q=0.9' } });
      if(res.ok){
        const text = await res.text();
        const cleaned = text.trim();
        return { text: cleaned.length ? cleaned : '(No text found)', source: 'file' };
      }
      if(res.status !== 404){
        throw new Error('Text fetch failed');
      }
    }
    const localImagePath = entry.url.startsWith('/') ? entry.url : `/${entry.url}`;
    if(!localImagePath.startsWith('/data/')){
      return null;
    }
    const aiResult = await fetchAiText(localImagePath);
    if(!aiResult) return null;
    return aiResult;
  }

  async function fetchAiText(imagePath: string): Promise<TextCacheEntry | null>{
    const params = new URLSearchParams({ image: imagePath });
    const res = await fetch(`/api/page-text?${params.toString()}`, { headers: { 'Accept': 'application/json' } });
    if(!res.ok){
      if(res.headers.get('content-type')?.includes('application/json')){
        const data = await res.json().catch(()=> ({})) as { error?: string };
        throw new Error(data.error || 'AI extraction failed');
      }
      const text = await res.text().catch(()=> '');
      throw new Error(text || 'AI extraction failed');
    }
    const data = await res.json() as { text?: string; source?: string };
    const raw = typeof data.text === 'string'? data.text.trim() : '';
    const text = raw.length ? raw : '(No text found)';
    return { text, source: data.source === 'file' ? 'file' : 'ai' };
  }

  async function ensurePageText(entry: PageEntry): Promise<TextCacheEntry | null>{
    const cacheKey = entry.url;
    let cached = textCache.get(cacheKey);
    if(cached){
      return cached;
    }
    const textUrl = deriveTextUrl(entry.url);
    const result = await loadPageText(entry, textUrl);
    if(result){
      textCache.set(cacheKey, result);
    }
    return result;
  }

  function stopAudio(){
    if(!audioPlayer.paused){
      audioPlayer.pause();
    }
    if(audioPlayer.currentTime){
      audioPlayer.currentTime = 0;
    }
    playBtn.classList.remove('active');
    audioPageKey = null;
  }

  async function playAudio(): Promise<void>{
    if(!app.imgs.length){
      showToast('No page loaded');
      return;
    }
    if(playBtn.disabled || playBtn.dataset.busy === '1'){
      return;
    }
    const entry = app.imgs[app.idx];
    const cacheKey = entry.url;
    if(!audioPlayer.paused && audioPageKey === cacheKey){
      stopAudio();
      return;
    }
    playBtn.disabled = true;
    playBtn.dataset.busy = '1';
    try{
      let textData = textCache.get(cacheKey);
      if(!textData){
        showToast('Preparing page text…');
        textData = await ensurePageText(entry);
      }
      if(!textData){
        showToast('No text available for audio');
        return;
      }
      let audioInfo = audioCache.get(cacheKey);
      if(!audioInfo){
        const localImagePath = entry.url.startsWith('/') ? entry.url : `/${entry.url}`;
        if(!localImagePath.startsWith('/data/')){
          showToast('Audio unavailable for this source');
          return;
        }
        showToast('Generating narration…');
        const response = await fetch('/api/page-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            image: localImagePath,
            text: textData.text
          })
        });
        const payloadText = await response.text();
        let payload: { url?: string; source?: string; error?: string } = {};
        if(payloadText){
          try{ payload = JSON.parse(payloadText); }catch(e){ payload = {}; }
        }
        if(!response.ok){
          throw new Error(payload.error || `Audio request failed (${response.status})`);
        }
        if(!payload || typeof payload.url !== 'string'){
          throw new Error('Audio response missing URL');
        }
        audioInfo = { url: payload.url, source: payload.source === 'ai' ? 'ai' : 'file' };
        audioCache.set(cacheKey, audioInfo);
        if(audioInfo.source === 'ai'){
          showToast('Generated narration with OpenAI');
        }
      }else{
        showToast('Loading saved narration…');
      }
      stopAudio();
      audioPlayer.src = audioInfo.url;
      audioPageKey = cacheKey;
      await audioPlayer.play();
      showToast(audioInfo.source === 'ai' ? 'Playing generated narration' : 'Playing saved narration');
    }catch(err){
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      showToast(message || 'Failed to play audio');
      stopAudio();
    }finally{
      playBtn.disabled = false;
      delete playBtn.dataset.busy;
    }
  }

  function showTextModal(title: string, content: string){
    textModalTitle.textContent = title || 'Page Text';
    setTextModalContent(content);
    textModal.classList.add('show');
    modalOpen = true;
  }

  function setTextModalContent(content: string){
    textModalBody.textContent = content || '';
    textModalBody.scrollTop = 0;
  }

  function hideTextModal(): void{
    textModal.classList.remove('show');
    textModalBody.textContent = '';
    modalOpen = false;
  }

  async function refreshBooks(saved?: StoredState | null): Promise<void>{
    const sourceState = saved || snapshotState();
    const usingInitial = !!(initialState && saved === initialState);
    bookSelect.disabled = true; refreshBooksBtn.disabled = true;
    bookSelect.innerHTML = '';
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading…';
    bookSelect.appendChild(loadingOpt);
    try{
      const data = await fetchJson<{ books?: string[] }>('/api/books');
      const books = Array.isArray(data?.books)? data.books : [];
      app.books = books;
      bookSelect.innerHTML = '';
      if(!books.length){
        stopAudio();
        audioCache.clear();
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No books available';
        bookSelect.appendChild(opt);
        app.imgs = []; app.idx = 0;
        app.zoom = 1;
        app.zoomMode = 'fit-width';
        renderThumbs(); renderPage({recenter:true});
        return;
      }
      books.forEach(book=>{
        const opt = document.createElement('option');
        opt.value = book;
        opt.textContent = book;
        bookSelect.appendChild(opt);
      });
      let target = sourceState.bookId && books.includes(sourceState.bookId) ? sourceState.bookId : null;
      if(!target) target = books[0];
      bookSelect.value = target;
      await loadBook(target, sourceState);
    }catch(err){
      console.error(err);
      bookSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Failed to load books';
      bookSelect.appendChild(opt);
      showToast('Failed to load book list');
    }finally{
      bookSelect.disabled = !app.books.length;
      refreshBooksBtn.disabled = false;
      if(usingInitial) initialState = null;
    }
  }

  async function loadBook(bookId: string | null, saved: StoredState | null): Promise<void>{
    if(modalOpen) hideTextModal();
    stopAudio();
    textCache.clear();
    audioCache.clear();
    if(!bookId){
      app.bookId = null;
      app.imgs = [];
      app.idx = 0;
      app.pan = {x:0,y:0};
      app.zoom = 1;
      app.angle = 0;
      app.zoomMode = 'fit-width';
      renderThumbs(); renderPage({recenter:true}); saveState();
      return;
    }
    try{
      const data = await fetchJson<{ manifest?: unknown[] }>(`/api/books/${encodeURIComponent(bookId)}/manifest`);
      const manifest = Array.isArray(data?.manifest)? data.manifest : [];
      if(!manifest.length){
        app.bookId = bookId;
        app.imgs = [];
        app.idx = 0;
        app.pan = {x:0,y:0};
        app.zoom = 1;
        app.angle = 0;
        app.zoomMode = 'fit-width';
        renderThumbs(); renderPage({recenter:true}); saveState();
        showToast(`No pages found for ${bookId}`);
        return;
      }
      app.bookId = bookId;
      app.imgs = manifest.map((url,i)=>{
        const str = String(url);
        const parts = str.split('/');
        const raw = parts[parts.length-1] || `page-${i+1}`;
        let name = raw;
        try{ name = decodeURIComponent(raw); }catch(e){}
        return { name, url: str };
      });
      const restored = !!saved && saved.bookId === bookId;
      const savedMode = saved && typeof saved.zoomMode === 'string' && ['fit-width','fit-height','custom'].includes(saved.zoomMode) ? (saved.zoomMode as ZoomMode) : null;
      app.zoomMode = restored && savedMode ? savedMode : 'fit-width';
      if(restored && saved){
        const savedIdx = typeof saved.idx === 'number' && Number.isFinite(saved.idx) ? Math.trunc(saved.idx) : 0;
        app.idx = Math.min(Math.max(0, savedIdx), app.imgs.length-1);
        const savedZoom = typeof saved.zoom === 'number' && Number.isFinite(saved.zoom) ? saved.zoom : 1;
        app.zoom = savedZoom;
        app.angle = 0;
        if(typeof saved.brightness === 'number' && Number.isFinite(saved.brightness)) app.brightness = saved.brightness;
        if(typeof saved.contrast === 'number' && Number.isFinite(saved.contrast)) app.contrast = saved.contrast;
        app.thumbsOpen = Boolean(saved.thumbsOpen);
        brightnessInput.value = String(app.brightness);
        contrastInput.value = String(app.contrast);
        thumbs.classList.toggle('open', app.thumbsOpen);
      }else{
        app.idx = 0;
        app.zoom = 1;
        app.zoomMode = 'fit-width';
      }
      app.angle = 0;
      app.pan = {x:0, y:0};
      renderThumbs(); renderPage({recenter:true}); saveState();
      showToast(`Loaded ${app.imgs.length} page(s) from ${bookId}`);
    }catch(err){
      console.error(err);
      showToast('Failed to load book manifest');
    }
  }

  async function fetchJson<T = unknown>(url: string): Promise<T>{
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  function fitWidth(){
    if(!app.imgs.length) return;
    app.zoomMode = 'fit-width';
    applyZoomMode({ recenter: true });
    saveState();
  }

  function fitHeight(){
    if(!app.imgs.length) return;
    app.zoomMode = 'fit-height';
    applyZoomMode({ recenter: true });
    saveState();
  }

  function next(){
    if(app.idx < app.imgs.length-1){
      stopAudio();
      if(modalOpen) hideTextModal();
      app.idx++;
      app.pan = {x:0, y:0};
      renderPage({recenter:true});
      saveState();
    }
  }
  function prev(){
    if(app.idx > 0){
      stopAudio();
      if(modalOpen) hideTextModal();
      app.idx--;
      app.pan = {x:0, y:0};
      renderPage({recenter:true});
      saveState();
    }
  }

  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  fitWidthBtn.addEventListener('click', fitWidth);
  fitHeightBtn.addEventListener('click', fitHeight);

  zoomInBtn.addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = Math.min(8, app.zoom*1.1);
    updateTransform(); updateCounter(); saveState();
  });
  zoomOutBtn.addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = Math.max(0.05, app.zoom/1.1);
    updateTransform(); updateCounter(); saveState();
  });
  resetZoomBtn.addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = 1;
    app.pan={x:0,y:0};
    updateTransform(); updateCounter(); saveState();
  });
  rotateBtn.addEventListener('click', ()=>{
    app.angle = (app.angle+90)%360;
    applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    saveState();
  });
  invertBtn.addEventListener('click', ()=>{
    app.invert = !app.invert;
    applyFilters();
    saveState();
  });
  playBtn.addEventListener('click', ()=>{ void playAudio(); });
  document.addEventListener('click', (event: MouseEvent)=>{
    if(event.target === playBtn){
      void playAudio();
    }
  });
  textBtn.addEventListener('click', ()=>{ void openTextPreview(); });

  brightnessInput.addEventListener('input', (e)=>{
    const target = e.target as HTMLInputElement;
    app.brightness = Number(target.value);
    applyFilters();
    saveState();
  });
  contrastInput.addEventListener('input', (e)=>{
    const target = e.target as HTMLInputElement;
    app.contrast = Number(target.value);
    applyFilters();
    saveState();
  });

  gotoBtn.addEventListener('click', ()=>{
    const v = Number.parseInt(gotoInput.value,10);
    if(!Number.isFinite(v) || v<1 || v>app.imgs.length) return;
    stopAudio();
    if(modalOpen) hideTextModal();
    app.idx = v-1;
    app.pan = {x:0, y:0};
    renderPage({recenter:true}); saveState();
  });

  toggleThumbsBtn.addEventListener('click', ()=>{
    app.thumbsOpen = !app.thumbsOpen; thumbs.classList.toggle('open', app.thumbsOpen);
    applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    saveState();
  });

  fullBtn.addEventListener('click', ()=>{
    const el = document.documentElement;
    if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); }
  });

  let dragging = false;
  let start: { x: number; y: number } = {x:0,y:0};
  let startPan: Pan = {x:0,y:0};
  viewer.addEventListener('mousedown', (e: MouseEvent)=>{
    if(e.button!==0) return;
    dragging=true;
    start = {x:e.clientX,y:e.clientY};
    startPan = {...app.pan};
    viewer.classList.add('dragging');
  });
  window.addEventListener('mouseup', ()=>{ dragging=false; viewer.classList.remove('dragging'); saveState(); });
  window.addEventListener('mousemove', (e: MouseEvent)=>{
    if(!dragging) return;
    app.pan = { x: startPan.x + (e.clientX-start.x), y: startPan.y + (e.clientY-start.y)};
    updateTransform();
  });

  viewer.addEventListener('wheel', (e: WheelEvent)=>{
    e.preventDefault();
    app.pan.x -= e.deltaX;
    app.pan.y -= e.deltaY;
    updateTransform();
  }, {passive:false});

  window.addEventListener('keydown',(e: KeyboardEvent)=>{
    const activeTag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
    if(['INPUT','TEXTAREA'].includes(activeTag)) return;
    switch(e.key){
      case 'ArrowRight': case 'PageDown': case ' ': next(); break;
      case 'ArrowLeft': case 'PageUp': prev(); break;
      case '+': case '=':
        app.zoomMode = 'custom';
        app.zoom=Math.min(8, app.zoom*1.1);
        updateTransform(); updateCounter(); saveState();
        break;
      case '-':
        app.zoomMode = 'custom';
        app.zoom=Math.max(0.05, app.zoom/1.1);
        updateTransform(); updateCounter(); saveState();
        break;
      case '0':
        app.zoomMode = 'custom';
        app.zoom=1;
        app.pan={x:0,y:0};
        updateTransform(); updateCounter(); saveState();
        break;
      case 'w': case 'W': fitWidth(); break;
      case 'h': case 'H': fitHeight(); break;
      case 'r': case 'R':
        app.angle=(app.angle+90)%360;
        applyZoomMode({ recenter: app.zoomMode !== 'custom' });
        saveState();
        break;
      case 'i': case 'I':
        app.invert = !app.invert;
        applyFilters(); saveState();
        break;
      case 'x': case 'X':
        void openTextPreview();
        break;
      case 'p': case 'P':
        void playAudio();
        break;
      case 't': case 'T': toggleThumbsBtn.click(); break;
      case 'g': case 'G': gotoInput.focus(); break;
      case 'f': case 'F': fullBtn.click(); break;
    }
  });

  window.addEventListener('resize', ()=>{
    if(!app.imgs.length) return;
    const changed = applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    if(changed) saveState();
  });
  pageImg.addEventListener('load', ()=>{
    const changed = applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    if(changed) saveState();
  });

  bookSelect.addEventListener('change', ()=>{
    const value = bookSelect.value;
    if(!value){
      void loadBook(null, null);
      return;
    }
    void loadBook(value, null);
  });

  void refreshBooks(initialState);

  if('serviceWorker' in navigator){
    const code = `self.addEventListener('install', e=> self.skipWaiting()); self.addEventListener('activate', e=> clients.claim());`;
    const blob = new Blob([code], {type:'text/javascript'});
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl).catch(()=>{});
  }

  refreshBooksBtn.addEventListener('click', ()=>{ void refreshBooks(snapshotState()); });
  textModalClose.addEventListener('click', hideTextModal);
  textModal.addEventListener('click', (e: MouseEvent)=>{ if(e.target === textModal) hideTextModal(); });
  window.addEventListener('keydown', (e: KeyboardEvent)=>{
    if(e.key === 'Escape' && modalOpen){
      hideTextModal();
    }
  });

  return () => {};
}
