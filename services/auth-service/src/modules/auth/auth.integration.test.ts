import { execSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let postgresContainer: StartedPostgreSqlContainer;
let redisContainer: StartedTestContainer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- se importa dinamicamente recien con el env real seteado
let app: any;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("auth_test")
    .withUsername("orderflow")
    .withPassword("orderflow_dev")
    .start();

  redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();

  // "localhost" en Windows + Docker Desktop resuelve a IPv6 y el forwarding
  // de puerto falla ahi (mismo bug ya encontrado con la infra real del
  // proyecto) - se fuerza 127.0.0.1 en vez de confiar en getHost()/getConnectionUri().
  const pgHost = postgresContainer.getHost() === "localhost" ? "127.0.0.1" : postgresContainer.getHost();
  const redisHost = redisContainer.getHost() === "localhost" ? "127.0.0.1" : redisContainer.getHost();

  // env.ts valida process.env al importarse - hay que setear esto ANTES de
  // importar nada que dependa de el (app.js -> infra/* -> shared/config/env.js).
  process.env.DATABASE_URL = `postgresql://orderflow:orderflow_dev@${pgHost}:${postgresContainer.getMappedPort(5432)}/auth_test`;
  process.env.REDIS_URL = `redis://${redisHost}:${redisContainer.getMappedPort(6379)}`;
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.NODE_ENV = "test";

  execSync("npx prisma migrate deploy", { env: process.env, stdio: "inherit" });

  ({ app } = await import("../../app.js"));
}, 60_000);

afterAll(async () => {
  await postgresContainer?.stop();
  await redisContainer?.stop();
});

describe("auth-service — flujo completo contra Postgres y Redis reales", () => {
  it("registra un usuario nuevo y devuelve un par de tokens", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "integration@test.com", password: "password123" });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
  });

  it("rechaza un registro duplicado con 409", async () => {
    await request(app).post("/auth/register").send({ email: "dup@test.com", password: "password123" });

    const response = await request(app)
      .post("/auth/register")
      .send({ email: "dup@test.com", password: "password123" });

    expect(response.status).toBe(409);
  });

  it("login con password incorrecta da 401", async () => {
    await request(app)
      .post("/auth/register")
      .send({ email: "wrongpass@test.com", password: "password123" });

    const response = await request(app)
      .post("/auth/login")
      .send({ email: "wrongpass@test.com", password: "otra-cosa" });

    expect(response.status).toBe(401);
  });

  it("login exitoso, y el refresh rota el token (el viejo deja de servir)", async () => {
    await request(app).post("/auth/register").send({ email: "refresh@test.com", password: "password123" });
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "refresh@test.com", password: "password123" });

    expect(login.status).toBe(200);

    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });

    expect(reuse.status).toBe(401);
  });
});
