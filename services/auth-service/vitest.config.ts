import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Levantar Postgres + Redis con Testcontainers tarda mucho mas que un
    // test unitario comun - el timeout default de 5s no alcanza.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
