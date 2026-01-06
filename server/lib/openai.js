import { OpenAI } from 'openai';
import { OCR_OPENAI_API_KEY, OCR_OPENAI_BASE_URL } from '../config.js';
import { createHttpError } from './errors.js';

let openaiClient = null;
let ocrOpenaiClient = null;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw createHttpError(503, 'OPENAI_API_KEY is required for this operation');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return openaiClient;
}

export function getOcrOpenAI() {
  if (!OCR_OPENAI_BASE_URL) {
    throw createHttpError(503, 'OCR_OPENAI_BASE_URL is required for OCR');
  }

  const apiKey = OCR_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw createHttpError(503, 'OCR_OPENAI_API_KEY or OPENAI_API_KEY is required for OCR');
  }

  if (!ocrOpenaiClient) {
    ocrOpenaiClient = new OpenAI({
      apiKey,
      baseURL: OCR_OPENAI_BASE_URL
    });
  }

  return ocrOpenaiClient;
}
