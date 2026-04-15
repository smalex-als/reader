import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertBookDirectory } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';

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

  return tempPath;
}
