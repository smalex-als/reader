import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertBookDirectory } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { getOpenAI } from './openai.js';
import { DATA_DIR } from '../config.js';

const execFileAsync = promisify(execFile);
const OCR_COORDINATE_SPACE = 1000;

function parseImageDimensions(output) {
  const widthMatch = String(output).match(/pixelWidth:\s*(\d+)/);
  const heightMatch = String(output).match(/pixelHeight:\s*(\d+)/);
  const width = widthMatch ? Number.parseInt(widthMatch[1], 10) : NaN;
  const height = heightMatch ? Number.parseInt(heightMatch[1], 10) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw createHttpError(500, 'Unable to determine image size');
  }
  return { width, height };
}

async function getImageDimensionsWithSips(sourcePath) {
  const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourcePath]);
  return parseImageDimensions(stdout);
}

async function getImageDimensionsWithImageMagick(command, args) {
  const { stdout } = await execFileAsync(command, args);
  const [widthRaw, heightRaw] = String(stdout).trim().split(/\s+/);
  const width = Number.parseInt(widthRaw, 10);
  const height = Number.parseInt(heightRaw, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw createHttpError(500, 'Unable to determine image size');
  }
  return { width, height };
}

async function getImageDimensions(sourcePath) {
  if (process.platform === 'darwin') {
    try {
      return await getImageDimensionsWithSips(sourcePath);
    } catch {
      // Fall through to ImageMagick below.
    }
  }
  try {
    return await getImageDimensionsWithImageMagick('magick', ['identify', '-format', '%w %h', sourcePath]);
  } catch {
    return getImageDimensionsWithImageMagick('identify', ['-format', '%w %h', sourcePath]);
  }
}

async function cropWithSips(sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft) {
  await execFileAsync('sips', [
    '-c',
    String(cropHeight),
    String(cropWidth),
    sourcePath,
    '--cropOffset',
    String(cropTop),
    String(cropLeft),
    '--out',
    tempPath
  ]);
}

async function cropWithImageMagick(command, sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft) {
  await execFileAsync(command, [
    sourcePath,
    '-crop',
    `${cropWidth}x${cropHeight}+${cropLeft}+${cropTop}`,
    '+repage',
    tempPath
  ]);
}

async function cropImage(sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft) {
  if (process.platform === 'darwin') {
    try {
      await cropWithSips(sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft);
      return;
    } catch {
      // Fall through to ImageMagick below.
    }
  }
  try {
    await cropWithImageMagick('magick', sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft);
  } catch {
    await cropWithImageMagick('convert', sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft);
  }
}

function normalizeCropBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) {
    throw createHttpError(400, 'Valid crop bounds are required');
  }
  const values = bounds.map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    throw createHttpError(400, 'Valid crop bounds are required');
  }
  const [left, top, right, bottom] = values;
  if (left < 0 || top < 0 || right > OCR_COORDINATE_SPACE || bottom > OCR_COORDINATE_SPACE) {
    throw createHttpError(400, 'Crop bounds are out of range');
  }
  if (right <= left || bottom <= top) {
    throw createHttpError(400, 'Crop bounds are invalid');
  }
  return [left, top, right, bottom];
}

async function resolveSourceImagePath(bookId, imageFilename) {
  const normalized = typeof imageFilename === 'string' ? path.basename(imageFilename.trim()) : '';
  if (!normalized) {
    throw createHttpError(400, 'Image filename is required');
  }
  if (normalized !== imageFilename.trim()) {
    throw createHttpError(400, 'Invalid image filename');
  }
  const directory = await assertBookDirectory(bookId);
  const sourcePath = path.join(directory, normalized);
  const stat = await safeStat(sourcePath);
  if (!stat?.isFile()) {
    throw createHttpError(404, 'Image file not found');
  }
  return { sourcePath, imageFilename: normalized };
}

function buildEnhancePrompt(caption) {
  const basePrompt =
    'Re-render this cropped image as a professionally made illustration. Preserve the entire original crop, composition, pose, framing, and meaning. Do not zoom in, do not crop tighter, do not cut off edges, and do not reframe the subject. Make the final result look like polished editorial or book illustration work created by a skilled human illustrator. Use strong intentional shapes, confident clean line work, controlled lighting, refined detail, subtle texture, and a cohesive tasteful palette. The result should feel publishable, elegant, and visually designed. Do not make it look like a photograph, a cheap AI render, or a glossy digital effect. Do not invent new objects, do not distort faces or anatomy, and do not add decorative clutter.';
  const normalizedCaption =
    typeof caption === 'string' ? caption.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return normalizedCaption ? `${basePrompt} Context: ${normalizedCaption}.` : basePrompt;
}

function chooseEditSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '1024x1024';
  }
  const ratio = width / height;
  if (ratio >= 1.15) {
    return '1536x1024';
  }
  if (ratio <= 1 / 1.15) {
    return '1024x1536';
  }
  return '1024x1024';
}

function makeEnhancedPreviewFileInfo({ bookId, imageFilename, bounds, caption }) {
  const digest = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        bookId,
        imageFilename,
        bounds,
        caption,
        model: 'gpt-image-1.5',
        prompt: buildEnhancePrompt(caption)
      })
    )
    .digest('hex')
    .slice(0, 20);
  const filename = `image-preview-${digest}.png`;
  const relativePath = path.join('_generated', 'image-preview', filename);
  return {
    outputPath: path.join(DATA_DIR, relativePath),
    url: `/data/${relativePath.replace(/\\/g, '/')}`
  };
}

export async function createImagePreviewCrop({ bookId, imageFilename, bounds }) {
  const normalizedBounds = normalizeCropBounds(bounds);
  const { sourcePath } = await resolveSourceImagePath(bookId, imageFilename);
  let dimensions;
  try {
    dimensions = await getImageDimensions(sourcePath);
  } catch (error) {
    console.error(error);
    throw createHttpError(500, 'Failed to inspect image. Ensure sips or ImageMagick is available.');
  }

  const [left, top, right, bottom] = normalizedBounds;
  const cropLeft = Math.max(0, Math.floor((left / OCR_COORDINATE_SPACE) * dimensions.width));
  const cropTop = Math.max(0, Math.floor((top / OCR_COORDINATE_SPACE) * dimensions.height));
  const cropRight = Math.min(dimensions.width, Math.ceil((right / OCR_COORDINATE_SPACE) * dimensions.width));
  const cropBottom = Math.min(dimensions.height, Math.ceil((bottom / OCR_COORDINATE_SPACE) * dimensions.height));
  const cropWidth = Math.max(1, cropRight - cropLeft);
  const cropHeight = Math.max(1, cropBottom - cropTop);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-image-preview-'));
  const tempPath = path.join(tempDir, 'preview.png');

  try {
    await cropImage(sourcePath, tempPath, cropHeight, cropWidth, cropTop, cropLeft);
  } catch (error) {
    console.error(error);
    throw createHttpError(500, 'Failed to crop image preview. Ensure sips or ImageMagick is available.');
  }

  return {
    tempPath,
    cropWidth,
    cropHeight
  };
}

export async function createEnhancedImagePreview({
  bookId,
  imageFilename,
  bounds,
  caption = null
}) {
  const { tempPath: croppedPath, cropWidth, cropHeight } = await createImagePreviewCrop({
    bookId,
    imageFilename,
    bounds
  });
  const { outputPath, url } = makeEnhancedPreviewFileInfo({ bookId, imageFilename, bounds, caption });

  try {
    const existing = await safeStat(outputPath);
    if (existing?.isFile()) {
      return { filePath: outputPath, url };
    }
    const imageBuffer = await fs.readFile(croppedPath);
    getOpenAI();
    const form = new FormData();
    form.append('model', 'gpt-image-1.5');
    form.append('prompt', buildEnhancePrompt(caption));
    form.append('size', chooseEditSize(cropWidth, cropHeight));
    form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'preview.png');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
      throw createHttpError(502, detail || `Image enhancement failed: ${response.status}`);
    }

    const payload = await response.json();
    const imageBase64 = payload?.data?.[0]?.b64_json;
    if (typeof imageBase64 !== 'string' || !imageBase64) {
      throw createHttpError(502, 'OpenAI did not return an enhanced image');
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(imageBase64, 'base64'));
    return { filePath: outputPath, url };
  } finally {
    await fs.rm(path.dirname(croppedPath), { recursive: true, force: true }).catch(() => {});
  }
}
