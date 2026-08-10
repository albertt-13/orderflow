import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/prisma.js", () => ({
  prisma: { $transaction: vi.fn() },
}));

vi.mock("../products/products.service.js", () => ({
  productsService: { recordSale: vi.fn() },
}));

vi.mock("./reservation.repository.js", () => ({
  reservationRepository: { findByOrderId: vi.fn() },
}));

const { prisma } = await import("../../infra/prisma.js");
const { productsService } = await import("../products/products.service.js");
const { reservationRepository } = await import("./reservation.repository.js");
const { reservationService } = await import("./reservation.service.js");

const PRODUCT_A = "11111111-1111-1111-1111-111111111111";
const PRODUCT_B = "33333333-3333-3333-3333-333333333333";
const ORDER_ID = "22222222-2222-2222-2222-222222222222";

interface FakeTx {
  $queryRaw: ReturnType<typeof vi.fn>;
  product: { update: ReturnType<typeof vi.fn> };
  stockReservation: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
}

/** Stock por producto que $queryRaw "ve" dentro de la transacción mockeada. */
function mockTransaction(stockByProduct: Record<string, number>): FakeTx {
  const tx: FakeTx = {
    $queryRaw: vi.fn((_parts: unknown, ...values: string[]) => {
      const productId = values[0] as string;
      const stock = stockByProduct[productId];
      return Promise.resolve(stock === undefined ? [] : [{ id: productId, stock }]);
    }),
    product: { update: vi.fn() },
    stockReservation: { create: vi.fn(), deleteMany: vi.fn() },
  };
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (tx: FakeTx) => unknown) => cb(tx)) as never);
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reservationService.reserve", () => {
  it("reserva cuando hay stock suficiente: descuenta y crea la reserva", async () => {
    const tx = mockTransaction({ [PRODUCT_A]: 10 });

    const result = await reservationService.reserve(ORDER_ID, [{ productId: PRODUCT_A, quantity: 3 }]);

    expect(result).toEqual({ ok: true });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_A },
      data: { stock: { decrement: 3 } },
    });
    expect(tx.stockReservation.create).toHaveBeenCalledWith({
      data: { orderId: ORDER_ID, productId: PRODUCT_A, quantity: 3 },
    });
    expect(productsService.recordSale).toHaveBeenCalledWith(PRODUCT_A, 3);
  });

  it("rechaza (negocio) sin descontar nada cuando no hay stock suficiente", async () => {
    const tx = mockTransaction({ [PRODUCT_A]: 1 });

    const result = await reservationService.reserve(ORDER_ID, [{ productId: PRODUCT_A, quantity: 5 }]);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("Sin stock suficiente") });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockReservation.create).not.toHaveBeenCalled();
  });

  it("rechaza (negocio) cuando el producto no existe", async () => {
    mockTransaction({}); // ningun producto conocido

    const result = await reservationService.reserve(ORDER_ID, [{ productId: PRODUCT_A, quantity: 1 }]);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("no encontrado") });
  });

  it("todo o nada: si un item no tiene stock, no se descuenta ninguno (ni el que sí alcanzaba)", async () => {
    const tx = mockTransaction({ [PRODUCT_A]: 10, [PRODUCT_B]: 0 });

    const result = await reservationService.reserve(ORDER_ID, [
      { productId: PRODUCT_A, quantity: 1 },
      { productId: PRODUCT_B, quantity: 1 },
    ]);

    expect(result.ok).toBe(false);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("NO trata un error técnico como falta de stock — lo deja subir para reintento/DLQ (bug real corregido)", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("connection terminated unexpectedly"));

    await expect(
      reservationService.reserve(ORDER_ID, [{ productId: PRODUCT_A, quantity: 1 }]),
    ).rejects.toThrow("connection terminated unexpectedly");
  });
});

describe("reservationService.release", () => {
  it("no hace nada si no habia reservas para esa orden (ej. la orden fue rechazada, nunca se reservo)", async () => {
    vi.mocked(reservationRepository.findByOrderId).mockResolvedValue([]);

    await reservationService.release(ORDER_ID);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("libera el stock reservado (lo incrementa de vuelta) y borra el registro de reserva", async () => {
    vi.mocked(reservationRepository.findByOrderId).mockResolvedValue([
      { id: "r1", orderId: ORDER_ID, productId: PRODUCT_A, quantity: 4, createdAt: new Date() },
    ] as never);
    const tx = mockTransaction({});

    await reservationService.release(ORDER_ID);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_A },
      data: { stock: { increment: 4 } },
    });
    expect(tx.stockReservation.deleteMany).toHaveBeenCalledWith({ where: { orderId: ORDER_ID } });
  });
});
