FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3009
ENV MAX_BYTES=26214400
ENV BITRATE=128k

USER node

EXPOSE 3009

CMD ["node", "server.js"]
