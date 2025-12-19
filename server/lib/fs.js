import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    throw createHttpError(404, 'Data directory not found');
  }
}

export async function safeStat(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
