import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHttpError } from './errors.js';

const execFileAsync = promisify(execFile);
const silenceCache = new Map();

function createTempPath(tempDir, suffix) {
  return path.join(tempDir, `.silence-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}${suffix}`);
}

async function probeMp3Format(buffer, tempDir) {
  const tempPath = createTempPath(tempDir, '.probe.mp3');
  try {
    await fs.writeFile(tempPath, buffer);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate,channels,bit_rate',
      '-of',
      'json',
      tempPath
    ]);
    const stream = JSON.parse(String(stdout)).streams?.[0] ?? {};
    const sampleRate = Number.parseInt(stream.sample_rate, 10);
    const channels = Number.parseInt(stream.channels, 10);
    const bitRate = Number.parseInt(stream.bit_rate, 10);
    if (!Number.isFinite(sampleRate) || !Number.isFinite(channels)) {
      throw new Error('Missing MP3 stream format');
    }
    return { sampleRate, channels, bitRate: Number.isFinite(bitRate) ? bitRate : 128000 };
  } catch {
    throw createHttpError(502, 'Failed to read generated MP3 chunk format');
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

/**
 * Builds a silent MP3 clip in the format of `reference`, so it can be spliced
 * between provider MP3 chunks without changing sample rate or channel count
 * midway through the file.
 */
export async function createMp3SilenceLike(reference, durationMs, tempDir) {
  const format = await probeMp3Format(reference, tempDir);
  const key = `${format.sampleRate}:${format.channels}:${format.bitRate}:${durationMs}`;
  const cached = silenceCache.get(key);
  if (cached) {
    return cached;
  }
  const tempPath = createTempPath(tempDir, '.mp3');
  try {
    await execFileAsync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${format.sampleRate}:cl=${format.channels === 1 ? 'mono' : 'stereo'}`,
      '-t',
      String(durationMs / 1000),
      '-c:a',
      'libmp3lame',
      '-b:a',
      String(format.bitRate),
      '-id3v2_version',
      '0',
      '-write_xing',
      '0',
      '-y',
      tempPath
    ]);
    const silence = await fs.readFile(tempPath);
    silenceCache.set(key, silence);
    return silence;
  } catch {
    throw createHttpError(502, 'Failed to generate MP3 silence');
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
