#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { stat, readdir, readFile, writeFile } = require('node:fs/promises');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = path.resolve(__dirname, '.');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const TEXT_PROMPT = `Extract all visible text from this image as plain text. Preserve paragraph structure and spacing. Normalize all fractions: instead of Unicode characters like ½ or ¼, use plain text equivalents like 1/2, 1/4, 1 1/2, etc. Do not use emojis, special characters, or markdown. Keep the content exactly as it appears, but ensure formatting is consistent: use normal paragraphs with one empty line between them. Preserve line breaks and indentation only where they represent clear paragraph or step boundaries.`;
const DEFAULT_VOICE_ID = 'santa';
const voiceProfiles = {
  santa: {
    openAiVoice: 'ash',
    instructions: `Identity: Santa Claus

Affect: Jolly, warm, and cheerful, with a playful and magical quality that fits Santa's personality.

Tone: Festive and welcoming, creating a joyful, holiday atmosphere for the caller.

Emotion: Joyful and playful, filled with holiday spirit, ensuring the caller feels excited and appreciated.

Pronunciation: Clear, articulate, and exaggerated in key festive phrases to maintain clarity and fun.

Pause: Brief pauses after each option and statement to allow for processing and to add a natural flow to the message.`
  }
};

const server = http.createServer(async (req, res) => {
  try{
    const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);
    if(url.pathname.startsWith('/api/')){
      await handleApi(req, res, url);
      return;
    }

    if(req.method !== 'GET' && req.method !== 'HEAD'){
      sendPlain(res, 405, 'Method Not Allowed');
      logRequest(405, req.method, url.pathname);
      return;
    }

    const filePath = resolvePath(url.pathname);
    if(!filePath){
      sendPlain(res, 400, 'Bad Request');
      logRequest(400, req.method, url.pathname);
      return;
    }

    let fileStat;
    try{
      fileStat = await stat(filePath);
      if(fileStat.isDirectory()){
        sendPlain(res, 404, 'Not Found');
        logRequest(404, req.method, url.pathname);
        return;
      }
    }catch(err){
      if(err && err.code === 'ENOENT'){
        sendPlain(res, 404, 'Not Found');
        logRequest(404, req.method, url.pathname);
        return;
      }
      throw err;
    }

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Content-Length': fileStat.size
    };

    if(req.method === 'HEAD'){
      res.writeHead(200, headers);
      res.end();
      logRequest(200, req.method, url.pathname);
      return;
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error)=>{
      if(!res.headersSent){
        sendPlain(res, 500, 'Server Error');
      }else{
        res.destroy(error);
      }
      logRequest(500, req.method, url.pathname);
    });
    res.on('finish', ()=> logRequest(200, req.method, url.pathname));
    stream.pipe(res);
  }catch(err){
    console.error(err);
    if(!res.headersSent){
      sendPlain(res, 500, 'Server Error');
    }else{
      res.destroy(err);
    }
  }
});

server.listen(PORT, HOST, ()=>{
  console.log(`Scanned Book Reader server listening on http://${HOST}:${PORT}`);
  console.log(`Serving from ${ROOT_DIR}`);
});

function resolvePath(urlPath){
  let requested = decodeURIComponent(urlPath || '/');
  if(requested === '/' || requested === ''){
    requested = '/index.html';
  }
  const candidate = path.resolve(ROOT_DIR, '.' + requested);
  if(!candidate.startsWith(ROOT_DIR)){
    return null;
  }
  return candidate;
}

async function handleApi(req, res, url){
  if(url.pathname === '/api/page-audio'){
    if(req.method !== 'POST'){
      sendPlain(res, 405, 'Method Not Allowed');
      logRequest(405, req.method, url.pathname);
      return;
    }
    await handlePageAudio(req, res);
    return;
  }

  if(req.method !== 'GET'){
    sendPlain(res, 405, 'Method Not Allowed');
    logRequest(405, req.method, url.pathname);
    return;
  }

  if(url.pathname === '/api/books'){
    try{
      const dirs = await readdir(DATA_DIR, { withFileTypes: true });
      const books = dirs
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b)=> a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      sendJson(res, 200, { books });
      logRequest(200, req.method, url.pathname);
      return;
    }catch(err){
      if(err && err.code === 'ENOENT'){
        sendJson(res, 200, { books: [] });
        logRequest(200, req.method, url.pathname);
        return;
      }
      throw err;
    }
  }

  const manifestMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/manifest$/);
  if(manifestMatch){
    const rawId = manifestMatch[1];
    const bookId = decodeURIComponent(rawId);
    const bookPath = path.resolve(DATA_DIR, bookId);
    if(!bookPath.startsWith(DATA_DIR)){
      sendPlain(res, 400, 'Bad Request');
      logRequest(400, req.method, url.pathname);
      return;
    }

    let dirEntries;
    try{
      dirEntries = await readdir(bookPath, { withFileTypes: true });
    }catch(err){
      if(err && err.code === 'ENOENT'){
        sendPlain(res, 404, 'Not Found');
        logRequest(404, req.method, url.pathname);
        return;
      }
      throw err;
    }

    const images = dirEntries
      .filter(dirent => dirent.isFile() && IMAGE_EXTS.has(path.extname(dirent.name).toLowerCase()))
      .map(dirent => `/data/${bookId}/${dirent.name}`)
      .sort((a, b)=> a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    sendJson(res, 200, { book: bookId, manifest: images });
    logRequest(200, req.method, url.pathname);
    return;
  }

  if(url.pathname === '/api/page-text'){
    await handlePageText(req, res, url);
    return;
  }

  sendPlain(res, 404, 'Not Found');
  logRequest(404, req.method, url.pathname);
}

async function handlePageText(req, res, url){
  const imageParam = url.searchParams.get('image');
  if(!imageParam){
    sendPlain(res, 400, 'Missing image parameter');
    logRequest(400, req.method, url.pathname);
    return;
  }

  let decodedPath;
  try{
    decodedPath = decodeURIComponent(imageParam);
  }catch(e){
    sendPlain(res, 400, 'Invalid image parameter');
    logRequest(400, req.method, url.pathname);
    return;
  }

  if(!decodedPath.startsWith('/')) decodedPath = '/' + decodedPath;
  const fsImagePath = path.resolve(ROOT_DIR, '.' + decodedPath);
  if(!fsImagePath.startsWith(DATA_DIR)){
    sendPlain(res, 400, 'Image path outside data directory');
    logRequest(400, req.method, url.pathname);
    return;
  }

  let fileStat;
  try{
    fileStat = await stat(fsImagePath);
  }catch(err){
    if(err && err.code === 'ENOENT'){
      sendPlain(res, 404, 'Image not found');
      logRequest(404, req.method, url.pathname);
      return;
    }
    throw err;
  }

  if(!fileStat.isFile()){
    sendPlain(res, 400, 'Invalid image');
    logRequest(400, req.method, url.pathname);
    return;
  }

  const ext = path.extname(fsImagePath).toLowerCase();
  if(!IMAGE_EXTS.has(ext)){
    sendPlain(res, 400, 'Unsupported image type');
    logRequest(400, req.method, url.pathname);
    return;
  }

  const textPath = fsImagePath.replace(/\.[^/.]+$/, '.txt');
  try{
    const content = await readFile(textPath, 'utf8');
    sendJson(res, 200, { source: 'file', text: content });
    logRequest(200, req.method, url.pathname);
    return;
  }catch(err){
    if(!err || err.code !== 'ENOENT') throw err;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey){
    sendJson(res, 503, { error: 'OPENAI_API_KEY not configured' });
    logRequest(503, req.method, url.pathname);
    return;
  }

  try{
    const aiText = await extractTextWithOpenAI(fsImagePath, ext, apiKey);
    if(!aiText){
      sendJson(res, 502, { error: 'Failed to extract text' });
      logRequest(502, req.method, url.pathname);
      return;
    }
    const trimmed = aiText.trim();
    try{
      await writeFile(textPath, trimmed, 'utf8');
    }catch(writeErr){
      console.warn('Failed to persist AI text', writeErr);
    }
    sendJson(res, 200, { source: 'ai', text: trimmed });
    logRequest(200, req.method, url.pathname);
  }catch(err){
    console.error('OpenAI extraction error', err);
    sendJson(res, 502, { error: 'Failed to extract text' });
    logRequest(502, req.method, url.pathname);
  }
}

async function handlePageAudio(req, res){
  let body = '';
  try{
    body = await readRequestBody(req);
  }catch(err){
    console.error('Failed to read audio request body', err);
    sendJson(res, 400, { error: 'Invalid request body' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }

  let payload = {};
  if(body){
    try{
      payload = JSON.parse(body);
    }catch(err){
      sendJson(res, 400, { error: 'Request body must be valid JSON' });
      logRequest(400, req.method, '/api/page-audio');
      return;
    }
  }

  const imageParam = typeof payload.image === 'string' ? payload.image : '';
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const requestedVoiceId = typeof payload.voice === 'string' && payload.voice.trim().length ? payload.voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE_ID];

  if(!imageParam){
    sendJson(res, 400, { error: 'Request must include image path' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }
  if(!text){
    sendJson(res, 400, { error: 'Request body must include text' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }

  let decodedPath;
  try{
    decodedPath = decodeURIComponent(imageParam);
  }catch(e){
    sendJson(res, 400, { error: 'Invalid image path' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }
  if(!decodedPath.startsWith('/')) decodedPath = '/' + decodedPath;
  const fsImagePath = path.resolve(ROOT_DIR, '.' + decodedPath);
  if(!fsImagePath.startsWith(DATA_DIR)){
    sendJson(res, 400, { error: 'Image must reside under /data' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }

  let fileStat;
  try{
    fileStat = await stat(fsImagePath);
  }catch(err){
    if(err && err.code === 'ENOENT'){
      sendJson(res, 404, { error: 'Image not found' });
      logRequest(404, req.method, '/api/page-audio');
      return;
    }
    throw err;
  }
  if(!fileStat.isFile()){
    sendJson(res, 400, { error: 'Invalid image file' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }

  const ext = path.extname(fsImagePath).toLowerCase();
  if(!IMAGE_EXTS.has(ext)){
    sendJson(res, 400, { error: 'Unsupported image type' });
    logRequest(400, req.method, '/api/page-audio');
    return;
  }

  const audioPath = fsImagePath.replace(/\.[^/.]+$/, '.mp3');
  try{
    await stat(audioPath);
    sendJson(res, 200, { source: 'file', url: filePathToUrl(audioPath) });
    logRequest(200, req.method, '/api/page-audio');
    return;
  }catch(err){
    if(!err || err.code !== 'ENOENT') throw err;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey){
    sendJson(res, 503, { error: 'OPENAI_API_KEY not configured' });
    logRequest(503, req.method, '/api/page-audio');
    return;
  }

  try{
    await generateSpeechWithOpenAI(text, voiceProfile, apiKey, audioPath);
    sendJson(res, 200, { source: 'ai', url: filePathToUrl(audioPath) });
    logRequest(200, req.method, '/api/page-audio');
  }catch(err){
    console.error('OpenAI TTS error', err);
    sendJson(res, 502, { error: 'Failed to synthesize audio' });
    logRequest(502, req.method, '/api/page-audio');
  }
}

async function extractTextWithOpenAI(imagePath, ext, apiKey){
  const buffer = await readFile(imagePath);
  const base64 = buffer.toString('base64');
  const mime = MIME_TYPES[ext] && MIME_TYPES[ext].startsWith('image/') ? MIME_TYPES[ext] : 'image/png';
  const payload = {
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: TEXT_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64}` }
          }
        ]
      }
    ],
    max_tokens: 2048
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if(!response.ok){
    const errBody = await response.text().catch(()=> '');
    throw new Error(`OpenAI request failed: ${response.status} ${errBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  return (typeof text === 'string' ? text : '').trim();
}

async function readRequestBody(req){
  const chunks = [];
  for await (const chunk of req){
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function filePathToUrl(fsPath){
  const relative = path.relative(ROOT_DIR, fsPath).split(path.sep).join('/');
  return '/' + relative;
}

async function generateSpeechWithOpenAI(text, voiceProfile, apiKey, outputPath){
  const payload = {
    model: 'gpt-4o-mini-tts',
    voice: voiceProfile.openAiVoice,
    format: 'mp3',
    input: text,
    instructions: voiceProfile.instructions
  };

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if(!response.ok){
    const errBody = await response.text().catch(()=> '');
    throw new Error(`OpenAI TTS failed: ${response.status} ${errBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(outputPath, buffer);
  return buffer;
}
function sendPlain(res, status, message){
  if(res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(message);
}

function sendJson(res, status, data){
  if(res.writableEnded) return;
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function logRequest(code, method, pathname){
  console.log(`[${new Date().toISOString()}] ${code} ${method} ${pathname}`);
}
