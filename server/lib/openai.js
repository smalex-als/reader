import { OpenAI } from 'openai';
import { createHttpError } from './errors.js';

let openaiClient = null;

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
