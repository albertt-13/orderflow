# OrderFlow

Sistema de gestión de pedidos estilo e-commerce, construido como proyecto de aprendizaje para
un rol Sr Backend. Evoluciona de monolito por capas a arquitectura de microservicios orientada
a eventos (Node, TypeScript, Express, PostgreSQL, Redis, RabbitMQ, Docker).

## Estado actual

Fase 0 — Entorno y fundamentos. Ver el roadmap completo en el vault de Obsidian del proyecto.

## Cómo levantarlo

1. Copiar `.env.example` a `.env` y ajustar valores si hace falta.
2. Levantar la infraestructura:

   ```bash
   docker compose up -d
   ```

3. Instalar dependencias y correr en modo desarrollo:

   ```bash
   npm install
   npm run dev
   ```

4. Verificar: `GET http://localhost:3000/health` debería responder `{ "status": "ok" }`.

## Stack

- TypeScript + Node + Express
- PostgreSQL (Prisma)
- Redis (ioredis)
- RabbitMQ (amqplib)
- Docker + Docker Compose
- Vitest + Supertest
- Pino para logging
- Zod para validación

## Scripts

- `npm run dev` — servidor en modo desarrollo con recarga automática
- `npm run build` — compila TypeScript a `dist/`
- `npm run lint` — ESLint
- `npm run typecheck` — chequeo de tipos sin emitir
- `npm run format` — Prettier
