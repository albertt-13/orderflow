FROM node:24-slim AS base
WORKDIR /app
COPY tsconfig.base.json ./tsconfig.base.json
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
COPY services/notifications-service ./services/notifications-service
WORKDIR /app/services/notifications-service

ENV NODE_ENV=production
EXPOSE 4004
CMD ["npx", "tsx", "src/server.ts"]
