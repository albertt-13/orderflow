FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/api-gateway/package.json ./services/api-gateway/package.json
COPY services/auth-service/package.json ./services/auth-service/package.json
COPY services/inventory-service/package.json ./services/inventory-service/package.json
COPY services/orders-service/package.json ./services/orders-service/package.json
COPY services/notifications-service/package.json ./services/notifications-service/package.json
RUN npm ci

FROM base AS runtime
COPY packages/shared ./packages/shared
COPY services/inventory-service ./services/inventory-service
WORKDIR /app/services/inventory-service
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 4002
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
