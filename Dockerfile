FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g tsx

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src/db/migrations ./src/db/migrations

EXPOSE 3000
CMD ["node", "dist/index.js"]
