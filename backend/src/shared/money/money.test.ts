import { describe, it, expect } from "vitest";
import { Money } from "./money.js";

describe("Money Value Object", () => {
  it("creates money from centavos correctly", () => {
    const m = Money.fromCentavos(99900);
    expect(m.toCentavos()).toBe(99900n);
    expect(m.toCentavosNumber()).toBe(99900);
    expect(m.toDecimal()).toBe("999.00");
    expect(m.format()).toBe("₱999.00");
  });

  it("creates money from decimal string correctly", () => {
    const m1 = Money.fromDecimal("1234.56");
    expect(m1.toCentavos()).toBe(123456n);
    expect(m1.format()).toBe("₱1,234.56");

    const m2 = Money.fromDecimal("0.05");
    expect(m2.toCentavos()).toBe(5n);

    const m3 = Money.fromDecimal("500");
    expect(m3.toCentavos()).toBe(50000n);
  });

  it("handles negative amounts correctly", () => {
    const m = Money.fromDecimal("-150.75");
    expect(m.isNegative()).toBe(true);
    expect(m.toDecimal()).toBe("-150.75");
    expect(m.format()).toBe("-₱150.75");
  });

  it("performs exact addition and subtraction without floating point error", () => {
    // 0.1 + 0.2 in JS float is 0.30000000000000004
    const m1 = Money.fromDecimal("0.10");
    const m2 = Money.fromDecimal("0.20");
    const sum = m1.add(m2);
    expect(sum.toDecimal()).toBe("0.30");

    const sub = sum.subtract(Money.fromDecimal("0.05"));
    expect(sub.toDecimal()).toBe("0.25");
  });

  it("performs comparisons accurately", () => {
    const a = Money.fromDecimal("999.00");
    const b = Money.fromDecimal("999.00");
    const c = Money.fromDecimal("1000.00");

    expect(a.equals(b)).toBe(true);
    expect(c.isGreaterThan(a)).toBe(true);
    expect(a.isLessThan(c)).toBe(true);
  });

  it("allocates amounts proportionally without losing remainder centavos", () => {
    // Distribute ₱100.00 across 3 equal parts (10000 centavos / 3 = 3333.333...)
    const total = Money.fromDecimal("100.00");
    const parts = total.allocate([1, 1, 1]);

    expect(parts).toHaveLength(3);
    expect(parts[0]?.toDecimal()).toBe("33.34");
    expect(parts[1]?.toDecimal()).toBe("33.33");
    expect(parts[2]?.toDecimal()).toBe("33.33");

    // Exact sum must equal original total
    const sum = parts[0]!.add(parts[1]!).add(parts[2]!);
    expect(sum.equals(total)).toBe(true);
  });

  it("multiplies correctly with rounded half up", () => {
    const m = Money.fromDecimal("999.00");
    const tax = m.multiply(0.12); // 119.88
    expect(tax.toDecimal()).toBe("119.88");
  });
});
