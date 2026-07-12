# syntax=docker/dockerfile:1

FROM node:20-bookworm AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ARG YT_DLP_VERSION=2026.07.04

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates poppler-utils curl lame ffmpeg imagemagick \
  && curl --fail --location \
    "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
    --output /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && yt-dlp --version \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

RUN mkdir -p /app/data
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

EXPOSE 3000

CMD ["node", "server.js"]
