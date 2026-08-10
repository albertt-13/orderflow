import { describe, expect, it } from "vitest";
import { Money } from "./money.js";

describe("Money", () => {
  it("suma sin el error de redondeo de los floats", () => {
    // 0.1 + 0.2 en floats de JS da 0.30000000000000004 - la razon de que
    // exista este Value Object en vez de usar number pelado.
    const a = Money.fromDecimalString("0.10");
    const b = Money.fromDecimalString("0.20");
    expect(a.plus(b).toDecimalString()).toBe("0.30");
  });

  it("multiplica por cantidad (precio unitario x cantidad)", () => {
    const price = Money.fromDecimalString("19.99");
    expect(price.times(3).toDecimalString()).toBe("59.97");
  });

  it("zero() es neutro para plus()", () => {
    const money = Money.fromDecimalString("42.50");
    expect(Money.zero().plus(money).toDecimalString()).toBe("42.50");
  });

  it("es igual por valor, no por instancia", () => {
    const a = Money.fromDecimalString("10.00");
    const b = Money.fromDecimalString("10.00");
    expect(a.equals(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rechaza construirse con un monto negativo", () => {
    expect(() => Money.fromDecimalString("-5.00")).toThrow();
  });

  it("rechaza multiplicar por una cantidad no entera", () => {
    const price = Money.fromDecimalString("10.00");
    expect(() => price.times(1.5)).toThrow();
  });

  it("parsea strings sin parte decimal", () => {
    expect(Money.fromDecimalString("5").toDecimalString()).toBe("5.00");
  });
});
