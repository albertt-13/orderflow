export interface HealthCheckResult {
  status: "ok" | "degraded";
  dependencies: Record<string, boolean>;
}

/**
 * Corre cada chequeo con un timeout corto — un health check no debería
 * quedarse esperando infinito a una dependencia lenta, tiene que poder
 * responder rápido con "no está" en vez de colgarse.
 */
export async function runHealthChecks(
  checks: Record<string, () => Promise<unknown>>,
  timeoutMs = 2000,
): Promise<HealthCheckResult> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        await Promise.race([
          check(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        return [name, true] as const;
      } catch {
        return [name, false] as const;
      }
    }),
  );

  const dependencies = Object.fromEntries(entries);
  const status: HealthCheckResult["status"] = entries.every(([, ok]) => ok) ? "ok" : "degraded";
  return { status, dependencies };
}
