FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV JOBWORKER_HOST=0.0.0.0
ENV JOBWORKER_PORT=3200
ENV JOBWORKER_DATA_DIR=/data

COPY package.json ./
COPY src ./src

RUN mkdir -p /data

EXPOSE 3200

CMD ["node", "src/server.js"]
