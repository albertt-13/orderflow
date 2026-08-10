import { Money } from "@orderflow/shared";
import { describe, expect, it } from "vitest";
import { OrderAggregate } from "./order.js";

function line(unitPrice: string, quantity: number) {
  return { productId: "11111111-1111-1111-1111-111111111111", unitPrice: Money.fromDecimalString(unitPrice), quantity };
}

describe("OrderAggregate", () => {
  it("no se puede crear sin items", () => {
    expect(() => OrderAggregate.create([])).toThrow();
  });

  it("arranca en PENDING al crearse", () => {
    const order = OrderAggregate.create([line("10.00", 2)]);
    expect(order.status).toBe("PENDING");
  });

  it("calcula el total sumando unitPrice x quantity de cada linea", () => {
    const order = OrderAggregate.create([line("10.00", 2), line("5.50", 1)]);
    expect(order.total.toDecimalString()).toBe("25.50");
  });

  it("permite las transiciones del camino feliz: PENDING -> CONFIRMED -> PAID -> SHIPPED", () => {
    const order = OrderAggregate.create([line("10.00", 1)]);
    order.transitionTo("CONFIRMED");
    expect(order.status).toBe("CONFIRMED");
    order.transitionTo("PAID");
    expect(order.status).toBe("PAID");
    order.transitionTo("SHIPPED");
    expect(order.status).toBe("SHIPPED");
  });

  it("permite cancelar desde PENDING (sin stock) o CONFIRMED (pago fallido)", () => {
    const rejectedAtStock = OrderAggregate.fromPersisted([], "PENDING");
    rejectedAtStock.transitionTo("CANCELLED");
    expect(rejectedAtStock.status).toBe("CANCELLED");

    const rejectedAtPayment = OrderAggregate.fromPersisted([], "CONFIRMED");
    rejectedAtPayment.transitionTo("CANCELLED");
    expect(rejectedAtPayment.status).toBe("CANCELLED");
  });

  it("rechaza saltarse un paso (PENDING directo a PAID)", () => {
    const order = OrderAggregate.fromPersisted([], "PENDING");
    expect(() => order.transitionTo("PAID")).toThrow(/No se puede pasar de PENDING a PAID/);
  });

  it("SHIPPED y CANCELLED son terminales - no aceptan ninguna transición más", () => {
    const shipped = OrderAggregate.fromPersisted([], "SHIPPED");
    expect(() => shipped.transitionTo("CANCELLED")).toThrow();

    const cancelled = OrderAggregate.fromPersisted([], "CANCELLED");
    expect(() => cancelled.transitionTo("PENDING")).toThrow();
  });

  it("no reintenta una transicion invalida como si fuera un error transitorio (mismo motivo por el que el consumer las manda directo a la DLQ)", () => {
    const order = OrderAggregate.fromPersisted([], "SHIPPED");
    let thrown: unknown;
    try {
      order.transitionTo("PENDING");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    // El estado no cambio a pesar del intento fallido.
    expect(order.status).toBe("SHIPPED");
  });
});
