import { Agent } from 'undici';
import {
  LLMPROXY_BODY_TIMEOUT_MS,
  LLMPROXY_CONNECT_TIMEOUT_MS,
  LLMPROXY_HEADERS_TIMEOUT_MS
} from '../config.js';

const llmproxyAgent = new Agent({
  headersTimeout: LLMPROXY_HEADERS_TIMEOUT_MS,
  bodyTimeout: LLMPROXY_BODY_TIMEOUT_MS,
  connectTimeout: LLMPROXY_CONNECT_TIMEOUT_MS
});

export function fetchLlmproxy(url, options) {
  return fetch(url, { ...options, dispatcher: llmproxyAgent });
}
