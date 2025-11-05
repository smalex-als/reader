(function(){
  const $ = sel => document.querySelector(sel);
  const app = {
    books: [],
    bookId: null,
    imgs: [], // {name, url}
    idx: 0,
    zoom: 1,
    zoomMode: 'fit-width',
    angle: 0,
    invert: false,
    brightness: 100,
    contrast: 100,
    thumbsOpen: false,
    pan: {x:0, y:0}
  };

  const pageImg = $('#page');
  const viewer = $('#viewer');
  const thumbs = $('#thumbs');
  const pageCounter = $('#pageCounter');
  const zoomLabel = $('#zoomLabel');
  const toast = $('#toast');
  const bookSelect = $('#bookSelect');
  const refreshBooksBtn = $('#refreshBooksBtn');
  const brightnessInput = $('#brightness');
  const contrastInput = $('#contrast');
  const gotoInput = $('#gotoInput');
  const invertBtn = $('#invertBtn');
  const textBtn = $('#textBtn');
  const textModal = $('#textModal');
  const textModalTitle = $('#textModalTitle');
  const textModalBody = $('#textModalBody');
  const textModalClose = $('#textModalClose');
  textBtn.disabled = true;

  const textCache = new Map();
  let modalOpen = false;
  const stateKey = 'scanned-book-reader:v1';
  let initialState = readState();
  applyState(initialState);

  function showToast(msg){
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(()=> toast.classList.remove('show'), 1800);
  }
  function saveState(){
    try{ localStorage.setItem(stateKey, JSON.stringify({
      bookId: app.bookId,
      idx: app.idx,
      zoom: app.zoom,
      zoomMode: app.zoomMode,
      invert: app.invert,
      brightness: app.brightness,
      contrast: app.contrast,
      thumbsOpen: app.thumbsOpen
    })); }catch(e){}
  }

  function readState(){
    try{
      return JSON.parse(localStorage.getItem(stateKey)||'null');
    }catch(e){
      return null;
    }
  }

  function applyState(state){
    if(!state) return;
    if(typeof state.bookId === 'string') app.bookId = state.bookId;
    if(Number.isFinite(state.idx)) app.idx = state.idx;
    if(Number.isFinite(state.zoom)) app.zoom = state.zoom;
    if(typeof state.zoomMode === 'string' && ['fit-width','fit-height','custom'].includes(state.zoomMode)){
      app.zoomMode = state.zoomMode;
    }
    if(Number.isFinite(state.brightness)) app.brightness = state.brightness;
    if(Number.isFinite(state.contrast)) app.contrast = state.contrast;
    if(typeof state.thumbsOpen === 'boolean') app.thumbsOpen = state.thumbsOpen;
    if(typeof state.invert === 'boolean') app.invert = state.invert;
    brightnessInput.value = app.brightness;
    contrastInput.value = app.contrast;
    thumbs.classList.toggle('open', app.thumbsOpen);
    invertBtn.classList.toggle('active', app.invert);
    if(modalOpen) hideTextModal();
    applyFilters();
    updateTransform();
    updateCounter();
  }

  function snapshotState(){
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

  function renderThumbs(){
    thumbs.innerHTML = '';
    app.imgs.forEach((it,i)=>{
      const el = document.createElement('div'); el.className = 'thumb'+(i===app.idx?' active':'');
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

  function escapeHtml(s){ return s.replace(/[&<>"]+/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function applyFilters(){
    const invertFilter = app.invert ? ' invert(1) hue-rotate(180deg)' : '';
    pageImg.style.filter = `brightness(${app.brightness}%) contrast(${app.contrast}%)${invertFilter}`;
    invertBtn.classList.toggle('active', app.invert);
  }

  function renderPage(options = {}){
    const { recenter = false } = options;
    const hasPages = app.imgs.length > 0;
    textBtn.disabled = !hasPages;
    if(!hasPages){
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

  function applyZoomMode({ recenter = false } = {}){
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

  function updateTransform(){
    clampPan();
    pageImg.style.transform = `translate(-50%, 0) translate(${app.pan.x}px, ${app.pan.y}px) rotate(${app.angle}deg) scale(${app.zoom})`;
  }

  function getViewportSize(){
    const width = Math.max(0, viewer.clientWidth - (app.thumbsOpen? 180 : 0));
    const height = Math.max(0, viewer.clientHeight);
    return { width, height };
  }

  function getContentSize(){
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

  function clampPan(){
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

  function computeFitWidth(){
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

  function computeFitHeight(){
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

  function deriveTextUrl(imageUrl){
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

  async function openTextPreview(){
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
      textCache.set(cacheKey, { text: 'Text not available for this page.', source: 'error' });
      textModalTitle.textContent = entry.name;
      setTextModalContent('Text not available for this page.');
      showToast('Failed to load page text');
    }
  }

  async function loadPageText(entry, textUrl){
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

  async function fetchAiText(imagePath){
    const params = new URLSearchParams({ image: imagePath });
    const res = await fetch(`/api/page-text?${params.toString()}`, { headers: { 'Accept': 'application/json' } });
    if(!res.ok){
      if(res.headers.get('content-type')?.includes('application/json')){
        const data = await res.json().catch(()=> ({}));
        throw new Error(data.error || 'AI extraction failed');
      }
      const text = await res.text().catch(()=> '');
      throw new Error(text || 'AI extraction failed');
    }
    const data = await res.json();
    const raw = typeof data.text === 'string'? data.text.trim() : '';
    const text = raw.length ? raw : '(No text found)';
    return { text, source: data.source === 'file' ? 'file' : 'ai' };
  }

  function showTextModal(title, content){
    textModalTitle.textContent = title || 'Page Text';
    setTextModalContent(content);
    textModal.classList.add('show');
    modalOpen = true;
  }

  function setTextModalContent(content){
    textModalBody.textContent = content || '';
    textModalBody.scrollTop = 0;
  }

  function hideTextModal(){
    textModal.classList.remove('show');
    textModalBody.textContent = '';
    modalOpen = false;
  }

  async function refreshBooks(saved){
    const sourceState = saved || snapshotState();
    const usingInitial = !!(initialState && saved === initialState);
    bookSelect.disabled = true; refreshBooksBtn.disabled = true;
    bookSelect.innerHTML = '';
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading…';
    bookSelect.appendChild(loadingOpt);
    try{
      const data = await fetchJson('/api/books');
      const books = Array.isArray(data?.books)? data.books : [];
      app.books = books;
      bookSelect.innerHTML = '';
      if(!books.length){
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

  async function loadBook(bookId, saved){
    if(modalOpen) hideTextModal();
    textCache.clear();
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
      const data = await fetchJson(`/api/books/${encodeURIComponent(bookId)}/manifest`);
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
      const restored = saved && saved.bookId === bookId;
      const savedMode = saved && typeof saved.zoomMode === 'string' && ['fit-width','fit-height','custom'].includes(saved.zoomMode) ? saved.zoomMode : null;
      app.zoomMode = restored && savedMode ? savedMode : 'fit-width';
      if(restored){
        app.idx = Math.min(Math.max(0, saved.idx|0), app.imgs.length-1);
        app.zoom = Number.isFinite(saved.zoom)? saved.zoom : 1;
        app.angle = 0;
        if(Number.isFinite(saved.brightness)) app.brightness = saved.brightness;
        if(Number.isFinite(saved.contrast)) app.contrast = saved.contrast;
        app.thumbsOpen = !!saved.thumbsOpen;
        brightnessInput.value = app.brightness;
        contrastInput.value = app.contrast;
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

  async function fetchJson(url){
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
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
      if(modalOpen) hideTextModal();
      app.idx++;
      app.pan = {x:0, y:0};
      renderPage({recenter:true});
      saveState();
    }
  }
  function prev(){
    if(app.idx > 0){
      if(modalOpen) hideTextModal();
      app.idx--;
      app.pan = {x:0, y:0};
      renderPage({recenter:true});
      saveState();
    }
  }

  $('#nextBtn').addEventListener('click', next);
  $('#prevBtn').addEventListener('click', prev);
  $('#fitWidthBtn').addEventListener('click', fitWidth);
  $('#fitHeightBtn').addEventListener('click', fitHeight);

  $('#zoomInBtn').addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = Math.min(8, app.zoom*1.1);
    updateTransform(); updateCounter(); saveState();
  });
  $('#zoomOutBtn').addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = Math.max(0.05, app.zoom/1.1);
    updateTransform(); updateCounter(); saveState();
  });
  $('#resetZoomBtn').addEventListener('click', ()=>{
    app.zoomMode = 'custom';
    app.zoom = 1;
    app.pan={x:0,y:0};
    updateTransform(); updateCounter(); saveState();
  });
  $('#rotateBtn').addEventListener('click', ()=>{
    app.angle = (app.angle+90)%360;
    applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    saveState();
  });
  invertBtn.addEventListener('click', ()=>{
    app.invert = !app.invert;
    applyFilters();
    saveState();
  });
  textBtn.addEventListener('click', openTextPreview);

  $('#brightness').addEventListener('input', (e)=>{ app.brightness = +e.target.value; applyFilters(); saveState(); });
  $('#contrast').addEventListener('input', (e)=>{ app.contrast = +e.target.value; applyFilters(); saveState(); });

  $('#gotoBtn').addEventListener('click', ()=>{
    const v = parseInt(gotoInput.value,10);
    if(!Number.isFinite(v) || v<1 || v>app.imgs.length) return;
    if(modalOpen) hideTextModal();
    app.idx = v-1;
    app.pan = {x:0, y:0};
    renderPage({recenter:true}); saveState();
  });

  $('#toggleThumbs').addEventListener('click', ()=>{
    app.thumbsOpen = !app.thumbsOpen; thumbs.classList.toggle('open', app.thumbsOpen);
    applyZoomMode({ recenter: app.zoomMode !== 'custom' });
    saveState();
  });

  $('#fullBtn').addEventListener('click', ()=>{
    const el = document.documentElement;
    if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); }
  });

  let dragging=false, start={x:0,y:0}, startPan={x:0,y:0};
  viewer.addEventListener('mousedown', (e)=>{
    if(e.button!==0) return; dragging=true; start={x:e.clientX,y:e.clientY}; startPan={...app.pan}; viewer.classList.add('dragging');
  });
  window.addEventListener('mouseup', ()=>{ dragging=false; viewer.classList.remove('dragging'); saveState(); });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return; app.pan = { x: startPan.x + (e.clientX-start.x), y: startPan.y + (e.clientY-start.y)}; updateTransform();
  });

  viewer.addEventListener('wheel', (e)=>{
    e.preventDefault();
    app.pan.x -= e.deltaX;
    app.pan.y -= e.deltaY;
    updateTransform();
  }, {passive:false});

  window.addEventListener('keydown',(e)=>{
    if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
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
        openTextPreview();
        break;
      case 't': case 'T': $('#toggleThumbs').click(); break;
      case 'g': case 'G': gotoInput.focus(); break;
      case 'f': case 'F': $('#fullBtn').click(); break;
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
      loadBook(null, null);
      return;
    }
    loadBook(value, null);
  });

  refreshBooks(initialState);

  if('serviceWorker' in navigator){
    const code = `self.addEventListener('install', e=> self.skipWaiting()); self.addEventListener('activate', e=> clients.claim());`;
    const blob = new Blob([code], {type:'text/javascript'});
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl).catch(()=>{});
  }

  refreshBooksBtn.addEventListener('click', ()=>{ refreshBooks(snapshotState()); });
  textModalClose.addEventListener('click', hideTextModal);
  textModal.addEventListener('click', (e)=>{ if(e.target === textModal) hideTextModal(); });
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && modalOpen){
      hideTextModal();
    }
  });
})();
