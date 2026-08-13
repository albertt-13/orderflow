import { env } from "../shared/config/env.js";

const TIMEOUT_MS = 3000;

export interface InventoryProduct {
  id: string;
  name: string;
  price: string;
  stock: number;
}

/**
 * Única llamada HTTP síncrona del flujo: orders-service necesita el precio
 * ACTUAL de cada producto para armar el total antes de crear la orden, y no
 * puede esperar un evento para eso (no hay usuario esperando una cola).
 * Todo lo demás de la saga (reservar stock, pago, confirmación) es
 * asíncrono por eventos.
 */
export async function getProductsByIds(ids: string[]): Promise<InventoryProduct[]> {
  if (ids.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${env.INVENTORY_SERVICE_URL}/products/by-ids?ids=${ids.join(",")}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "x-internal-secret": env.INTERNAL_SERVICE_SECRET },
    });

    if (!response.ok) {
      throw new Error(`inventory-service respondió ${response.status}`);
    }

    return (await response.json()) as InventoryProduct[];
  } finally {
    clearTimeout(timeout);
  }
}
