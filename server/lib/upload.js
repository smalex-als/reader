import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../config.js';

const MAX_UPLOAD_FIELDS = 4;

export const MULTIPART_UPLOAD_LIMITS = Object.freeze({
  fieldNameSize: 100,
  fieldSize: 64 * 1024,
  fields: MAX_UPLOAD_FIELDS,
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  parts: MAX_UPLOAD_FIELDS + 1,
  headerPairs: 32,
  fieldNestingDepth: 0
});

export function createMemoryUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: MULTIPART_UPLOAD_LIMITS
  });
}
