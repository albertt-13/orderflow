import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infra/inventoryClient.js", () => ({
  getProductsByIds: vi.fn(),
}));

vi.mock("../../infra/rabbitmq.js", () => ({
  publishEvent: vi.fn(),
}));

vi.mock("./orders.repository.js", () => ({
  ordersRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findByUser: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

const { getProductsByIds } = await import("../../infra/inventoryClient.js");
const { publishEvent } = await import("../../infra/rabbitmq.js");
const { ordersRepository } = await import("./orders.repository.js");
const { ordersService } = await import("./orders.service.js");

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

/**
 * El tipo real de Prisma para Order tiene Decimal e items ricos - en un
 * mock de test no vale la pena reconstruir eso, así que se castea. Es un
 * cast asumido a propósito, no un error de tipos ignorado por accidente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- helper de mocks de test, ver comentario arriba
function fakeOrder(overrides: Record<string, unknown>): any {
  return {
    id: "order-x",
    userId: USER_ID,
    status: "PENDING",
    total: "0.00",
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ordersService.create", () => {
  it("calcula el total a partir del precio ACTUAL de inventory, no de lo que mande el cliente", async () => {
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: PRODUCT_ID, name: "Producto", price: "19.99", stock: 10 },
    ]);
    // El tipo real de create() es el "thenable" fluido de Prisma
    // (Prisma__OrderClient), no un Promise plano - cast necesario para
    // poder devolver un objeto simple desde el mock.
    vi.mocked(ordersRepository.create).mockImplementation(((data: { userId: string; total: string }) =>
      fakeOrder({ id: "order-1", userId: data.userId, total: data.total })) as never);

    await ordersService.create(USER_ID, { items: [{ productId: PRODUCT_ID, quantity: 3 }] });

    expect(ordersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, total: "59.97" }),
    );
  });

  it("publica order.created recien despues de crear la orden (post-commit, no antes)", async () => {
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: PRODUCT_ID, name: "Producto", price: "10.00", stock: 10 },
    ]);
    vi.mocked(ordersRepository.create).mockResolvedValue(fakeOrder({ id: "order-2" }));

    await ordersService.create(USER_ID, { items: [{ productId: PRODUCT_ID, quantity: 1 }] });

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledWith(
      "order.created",
      expect.objectContaining({ orderId: "order-2", userId: USER_ID }),
    );
  });

  it("rechaza la orden si algun producto no existe en inventory (fail fast, sin crear nada)", async () => {
    vi.mocked(getProductsByIds).mockResolvedValue([]); // inventory no devolvio el producto pedido

    await expect(
      ordersService.create(USER_ID, { items: [{ productId: PRODUCT_ID, quantity: 1 }] }),
    ).rejects.toThrow(/no encontrado/);

    expect(ordersRepository.create).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});

describe("ordersService.advanceStatus", () => {
  it("permite una transicion manual valida (ej. admin marca SHIPPED)", async () => {
    vi.mocked(ordersRepository.findById).mockResolvedValue(fakeOrder({ id: "order-3", status: "PAID" }));
    vi.mocked(ordersRepository.updateStatus).mockResolvedValue(fakeOrder({ id: "order-3", status: "SHIPPED" }));

    const result = await ordersService.advanceStatus("order-3", "SHIPPED");

    expect(result.status).toBe("SHIPPED");
    expect(ordersRepository.updateStatus).toHaveBeenCalledWith("order-3", "SHIPPED");
  });

  it("rechaza una transicion invalida sin tocar el repositorio de escritura", async () => {
    vi.mocked(ordersRepository.findById).mockResolvedValue(fakeOrder({ id: "order-4", status: "PENDING" }));

    await expect(ordersService.advanceStatus("order-4", "SHIPPED")).rejects.toThrow(
      /No se puede pasar de PENDING a SHIPPED/,
    );

    expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("404 si la orden no existe", async () => {
    vi.mocked(ordersRepository.findById).mockResolvedValue(null);

    await expect(ordersService.advanceStatus("no-existe", "PAID")).rejects.toThrow(/no encontrada/);
  });
});
