# OrderFlow

Sistema de gestión de pedidos estilo e-commerce, construido como proyecto de aprendizaje para
un rol Sr Backend. Evoluciona de monolito por capas a arquitectura de microservicios orientada
a eventos (Node, TypeScript, Express, PostgreSQL, Redis, RabbitMQ, Docker).

## Estado actual

Fase 1 — Monolito sólido (en progreso). Ver el roadmap completo en el vault de Obsidian del proyecto.

## Endpoints

| Método | Ruta            | Auth | Descripción                                   |
|--------|-----------------|------|------------------------------------------------|
| POST   | `/auth/register`| —    | Crea un usuario (rol `CLIENTE` por defecto)    |
| POST   | `/auth/login`   | —    | Devuelve `accessToken` (15m) y `refreshToken` (7d) |
| GET    | `/health`       | —    | Health check                                   |

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

> Nota: si en tu máquina ya tenés Postgres en `5432` o Redis en `6379` corriendo para otro
> proyecto, este `docker-compose.yml` usa `5433` y `6380` como puertos de host para evitar el
> choque (el puerto interno del contenedor no cambia).

## Flujo de ramas

- **`main`** — rama de trabajo principal. Se pushea directo (proyecto individual).
- **`dev`** — solo para experimentos grandes o riesgosos que no querés en `main` todavía.
- **`produccion`** — espejo de `main`. Se actualiza a mano cuando algo ya está probado:

  ```bash
  git push origin main:produccion
  ```

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
