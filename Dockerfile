FROM node:20-slim AS base

RUN apt-get update && apt-get install -y \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

RUN npx playwright install chromium --with-deps

FROM base AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
