import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

export function nowIso() {
  return new Date().toISOString();
}

export function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeRelativePath(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(DATA_DIR, normalized);
  if (!resolved.startsWith(`${DATA_DIR}${path.sep}`) && resolved !== DATA_DIR) {
    throw new Error(`${fieldName} must stay under data directory`);
  }
  return normalized;
}

export function resolveDataPath(relativePath) {
  return path.resolve(DATA_DIR, relativePath);
}

export async function statFile(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const cause = error.cause;
  return {
    message: error.message,
    name: error.name,
    code: error.code ?? cause?.code ?? null,
    errno: error.errno ?? cause?.errno ?? null,
    syscall: error.syscall ?? cause?.syscall ?? null,
    address: error.address ?? cause?.address ?? null,
    port: error.port ?? cause?.port ?? null,
    causeMessage: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : null
  };
}

export function errorMessage(error) {
  const details = serializeError(error);
  return [details.message, details.code, details.syscall, details.address, details.port]
    .filter(Boolean)
    .join(' - ');
}

export async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

