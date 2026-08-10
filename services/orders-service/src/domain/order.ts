import { Money } from "@orderflow/shared";

export type OrderStatus = "PENDING" | "CONFIRMED" | "PAID" | "SHIPPED" | "CANCELLED";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: [],
  CANCELLED: [],
};

export interface OrderLine {
  productId: string;
  quantity: number;
  unitPrice: Money;
}

/**
 * Aggregate root: las transiciones de estado son responsabilidad de ESTE
 * objeto, no de un if/switch suelto en el service. Cualquier intento de
 * transición inválida falla ACA, en el dominio, no en la capa HTTP.
 */
export class OrderAggregate {
  private constructor(
    public readonly lines: OrderLine[],
    private _status: OrderStatus,
  ) {}

  static create(lines: OrderLine[]): OrderAggregate {
    if (lines.length === 0) {
      throw new Error("Una orden necesita al menos un item");
    }
    return new OrderAggregate(lines, "PENDING");
  }

  static fromPersisted(lines: OrderLine[], status: OrderStatus): OrderAggregate {
    return new OrderAggregate(lines, status);
  }

  get status(): OrderStatus {
    return this._status;
  }

  get total(): Money {
    return this.lines.reduce((sum, line) => sum.plus(line.unitPrice.times(line.quantity)), Money.zero());
  }

  transitionTo(next: OrderStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this._status];
    if (!allowed.includes(next)) {
      throw new Error(`No se puede pasar de ${this._status} a ${next}`);
    }
    this._status = next;
  }
}
