import type { OrderItemRef } from "@orderflow/shared";
import { prisma } from "../../infra/prisma.js";
import { productsService } from "../products/products.service.js";
import { reservationRepository } from "./reservation.repository.js";

type ReserveResult = { ok: true } | { ok: false; reason: string };

/**
 * Rechazo de NEGOCIO (sin stock, producto no existe) — se traduce en
 * "stock.rejected" y la orden se cancela, sin reintentar: reintentar no va
 * a hacer que aparezca stock de la nada.
 *
 * Cualquier OTRO error (conexión caída, bug, constraint inesperado) NO se
 * atrapa acá — sube tal cual al consumer, que lo trata como falla técnica
 * y reintenta/manda a la DLQ. Antes esto no estaba separado: un error
 * técnico transitorio terminaba cancelando la orden como si no hubiera
 * stock, en vez de reintentarse.
 */
class StockRejectionError extends Error {}

export const reservationService = {
  /**
   * Todo o nada: primero valida el stock de TODOS los items (bajo lock,
   * misma transaccion), y solo si todos alcanzan, descuenta y crea las
   * reservas. Si cualquiera falla, no se toca ni un producto - no quedan
   * descuentos parciales de una orden que termino rechazada.
   */
  async reserve(orderId: string, items: OrderItemRef[]): Promise<ReserveResult> {
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of items) {
          const rows = await tx.$queryRaw<
            { id: string; stock: number }[]
          >`SELECT id, stock FROM "Product" WHERE id = ${item.productId} FOR UPDATE`;

          const product = rows[0];
          if (!product) {
            throw new StockRejectionError(`Producto ${item.productId} no encontrado`);
          }
          if (product.stock < item.quantity) {
            throw new StockRejectionError(`Sin stock suficiente para el producto ${item.productId}`);
          }
        }

        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
          await tx.stockReservation.create({
            data: { orderId, productId: item.productId, quantity: item.quantity },
          });
        }
      });

      for (const item of items) {
        void productsService.recordSale(item.productId, item.quantity);
      }

      return { ok: true };
    } catch (err) {
      if (err instanceof StockRejectionError) {
        return { ok: false, reason: err.message };
      }
      throw err;
    }
  },

  /** Compensación: libera lo reservado para una orden cancelada/con pago fallido. */
  async release(orderId: string): Promise<void> {
    const reservations = await reservationRepository.findByOrderId(orderId);
    if (reservations.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const reservation of reservations) {
        await tx.product.update({
          where: { id: reservation.productId },
          data: { stock: { increment: reservation.quantity } },
        });
      }
      await tx.stockReservation.deleteMany({ where: { orderId } });
    });
  },
};
