/**
 * Value Object: representa un monto de dinero, no una cantidad cualquiera.
 * - Inmutable: cada operación devuelve una instancia nueva, nunca muta.
 * - Se valida a sí mismo: no se puede construir con un monto negativo.
 * - Igualdad por valor: dos Money("10.00") son intercambiables, no importa
 *   cuál instancia es "la original" (a diferencia de una Entity con id).
 *
 * Guarda centavos como bigint en vez de un number para no repetir el error
 * de los floats (0.1 + 0.2 !== 0.3) ni depender de una librería externa
 * solo para esto.
 */
export class Money {
  private readonly cents: bigint;

  private constructor(cents: bigint) {
    if (cents < 0n) {
      throw new Error("Money no puede ser negativo");
    }
    this.cents = cents;
  }

  static zero(): Money {
    return new Money(0n);
  }

  static fromDecimalString(value: string): Money {
    const [wholePart, fractionPart = ""] = value.split(".");
    const whole = BigInt(wholePart || "0");
    const fraction = BigInt(fractionPart.padEnd(2, "0").slice(0, 2) || "0");
    return new Money(whole * 100n + fraction);
  }

  plus(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  times(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("La cantidad debe ser un entero no negativo");
    }
    return new Money(this.cents * BigInt(quantity));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toDecimalString(): string {
    const whole = this.cents / 100n;
    const fraction = this.cents % 100n;
    return `${whole}.${fraction.toString().padStart(2, "0")}`;
  }
}
