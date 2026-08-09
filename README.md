# OrderFlow

Sistema de gestión de pedidos estilo e-commerce, construido como proyecto de aprendizaje para
un rol Sr Backend. Evoluciona de monolito por capas a arquitectura de microservicios orientada
a eventos (Node, TypeScript, Express, PostgreSQL, Redis, RabbitMQ, Docker).

## Estado actual

Fase 3 — RabbitMQ completa (eventos de dominio, worker con acks manuales, reintentos, dead
letter queue e idempotencia). Ver el roadmap completo en el vault de Obsidian del proyecto.

## Eventos (RabbitMQ)

Exchange topic `orderflow.events`. Al crear una orden se publica `order.created`; al cancelarla,
`order.cancelled`. Un worker separado los consume:

```bash
npm run worker
```

- Cola `orderflow.notifications`, bindeada con el patrón `order.*`.
- `channel.prefetch(1)` — un mensaje a la vez.
- Reintentos: hasta 3, con delay creciente (header `x-retry-count`); agotados los reintentos, el
  mensaje va a `orderflow.notifications.dlq`.
- Idempotencia vía Redis (`processed-events:{eventId}`) — un evento duplicado no se reprocesa.
- Panel de administración: http://localhost:15672 (guest/guest).

## Endpoints

| Método | Ruta                     | Auth        | Descripción                                                    |
|--------|--------------------------|-------------|-----------------------------------------------------------------|
| GET    | `/health`                | —           | Health check                                                    |
| POST   | `/auth/register`         | —           | Crea un usuario (rol `CLIENTE` por defecto)                     |
| POST   | `/auth/login`            | —           | Devuelve `accessToken` (15m) y `refreshToken` (7d). Rate limit: 5/15min por IP |
| POST   | `/auth/refresh`          | —           | Rota el refresh token; el usado queda inválido                  |
| POST   | `/auth/logout`           | —           | Invalida un refresh token puntual                               |
| POST   | `/auth/logout-all`       | autenticado | Invalida todos los refresh tokens del usuario                   |
| GET    | `/products`              | —           | Lista pública, paginada (`?page=&limit=`), filtro por `name`. Cacheada 60s (`X-Cache: HIT\|MISS`) |
| GET    | `/products/bestsellers`  | —           | Ranking de productos más vendidos (Redis sorted set)             |
| POST   | `/products`              | ADMIN       | Crea un producto                                                 |
| PATCH  | `/products/:id`          | ADMIN       | Actualiza campos parciales de un producto                       |
| DELETE | `/products/:id`          | ADMIN       | Borra un producto                                                |
| POST   | `/orders`                | autenticado | Crea una orden y descuenta stock en una transacción             |
| GET    | `/orders/me`             | autenticado | Órdenes del usuario autenticado, con sus items                  |
| PATCH  | `/orders/:id/status`     | ADMIN       | Avanza el estado de una orden (`PENDING→PAID→SHIPPED`/`CANCELLED`) |

**Cache de productos:** ~20ms sin cache (MISS) vs ~3ms con cache (HIT), medido local.

Colección de [Bruno](https://www.usebruno.com/) con todos los endpoints en `bruno/` — abrí esa
carpeta como colección, elegí el environment `Local`, y corré `Login`/`Login (Admin)` primero
(guardan el token solos).

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
- `npm run worker` — worker de eventos (RabbitMQ) en modo desarrollo
- `npm run build` — compila TypeScript a `dist/`
- `npm run lint` — ESLint
- `npm run typecheck` — chequeo de tipos sin emitir
- `npm run format` — Prettier
