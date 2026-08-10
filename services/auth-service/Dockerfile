# Multi-stage: la capa de deps instala TODO el workspace (necesita ver todos
# los package.json para que npm ci coincida con el lockfile), pero la capa
# final solo copia el código de este servicio + el paquete compartido -
# no arrastra el código fuente de los otros servicios a esta imagen.
FROM node:24-alpine AS base
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
COPY services/auth-service ./services/auth-service
WORKDIR /app/services/auth-service
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 4001
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
