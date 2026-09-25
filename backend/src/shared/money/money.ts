/**
 * Authoritative Money Value Object for BCIS
 * 
 * Invariant: Never use floating-point numbers for financial calculations.
 * All monetary amounts are represented internally as exact integer centavos (1 PHP = 100 centavos).
 */
export class Money {
  private readonly centavos: bigint;

  private constructor(centavos: bigint) {
    this.centavos = centavos;
  }

  /**
   * Create Money from integer centavos
   */
  public static fromCentavos(centavos: number | bigint): Money {
    if (typeof centavos === "number") {
      if (!Number.isSafeInteger(centavos)) {
        throw new TypeError(`Centavos value must be a safe integer, got ${centavos}`);
      }
      return new Money(BigInt(centavos));
    }
    return new Money(centavos);
  }

  /**
   * Create Money from decimal or string representation (e.g. 999.50, "999.50", "1200")
   */
  public static fromDecimal(amount: string | number): Money {
    const str = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(str)) {
      throw new Error(`Invalid monetary format: "${amount}". Expected decimal with up to 2 decimal places.`);
    }

    const isNegative = str.startsWith("-");
    const cleanStr = isNegative ? str.slice(1) : str;
    const parts = cleanStr.split(".");
    const whole = BigInt(parts[0] || "0");
    const fractionStr = (parts[1] || "").padEnd(2, "0").slice(0, 2);
    const fraction = BigInt(fractionStr);

    const totalCentavos = whole * 100n + fraction;
    return new Money(isNegative ? -totalCentavos : totalCentavos);
  }

  public static zero(): Money {
    return new Money(0n);
  }

  public toCentavos(): bigint {
    return this.centavos;
  }

  public toCentavosNumber(): number {
    const num = Number(this.centavos);
    if (!Number.isSafeInteger(num)) {
      throw new RangeError(`Centavos value ${this.centavos.toString()} exceeds safe JavaScript integer range`);
    }
    return num;
  }

  public toDecimal(): string {
    const isNegative = this.centavos < 0n;
    const absCentavos = isNegative ? -this.centavos : this.centavos;
    const whole = absCentavos / 100n;
    const fraction = absCentavos % 100n;
    const fractionStr = fraction.toString().padStart(2, "0");
    return `${isNegative ? "-" : ""}${whole.toString()}.${fractionStr}`;
  }

  public toDecimalString(): string {
    return this.toDecimal();
  }

  public toNumeric(): number {
    return Number(this.toDecimal());
  }

  public format(currencySymbol = "₱"): string {
    const isNegative = this.centavos < 0n;
    const absCentavos = isNegative ? -this.centavos : this.centavos;
    const whole = (absCentavos / 100n).toString();
    const fraction = (absCentavos % 100n).toString().padStart(2, "0");

    // Add thousand commas
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${isNegative ? "-" : ""}${currencySymbol}${withCommas}.${fraction}`;
  }

  public static min(a: Money, b: Money): Money {
    return a.isLessThanOrEqual(b) ? a : b;
  }

  public static max(a: Money, b: Money): Money {
    return a.isGreaterThanOrEqual(b) ? a : b;
  }

  public add(other: Money): Money {
    return new Money(this.centavos + other.centavos);
  }

  public plus(other: Money): Money {
    return this.add(other);
  }

  public subtract(other: Money): Money {
    return new Money(this.centavos - other.centavos);
  }

  public minus(other: Money): Money {
    return this.subtract(other);
  }

  public multiply(factor: number): Money {
    if (!Number.isFinite(factor)) {
      throw new Error(`Invalid multiplication factor: ${factor}`);
    }
    // Round to nearest centavo using round-half-up
    const result = Math.round(Number(this.centavos) * factor);
    return Money.fromCentavos(result);
  }

  public isZero(): boolean {
    return this.centavos === 0n;
  }

  public isPositive(): boolean {
    return this.centavos > 0n;
  }

  public isNegative(): boolean {
    return this.centavos < 0n;
  }

  public equals(other: Money): boolean {
    return this.centavos === other.centavos;
  }

  public isGreaterThan(other: Money): boolean {
    return this.centavos > other.centavos;
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    return this.centavos >= other.centavos;
  }

  public isLessThan(other: Money): boolean {
    return this.centavos < other.centavos;
  }

  public isLessThanOrEqual(other: Money): boolean {
    return this.centavos <= other.centavos;
  }

  /**
   * Distribute money into ratios without losing even a single centavo.
   * e.g. Distribute 100.00 into ratios [1, 1, 1] gives [33.34, 33.33, 33.33].
   */
  public allocate(ratios: number[]): Money[] {
    if (ratios.length === 0) {
      throw new Error("Cannot allocate among 0 targets");
    }
    const totalRatio = ratios.reduce((sum, r) => sum + r, 0);
    if (totalRatio <= 0) {
      throw new Error("Total ratio must be positive");
    }

    let remainder = this.centavos;
    const results: Money[] = [];

    for (const ratio of ratios) {
      const share = (this.centavos * BigInt(ratio)) / BigInt(totalRatio);
      results.push(new Money(share));
      remainder -= share;
    }

    // Distribute remainder centavos one by one to earliest shares
    for (let i = 0; remainder > 0n && i < results.length; i++) {
      const current = results[i]!;
      results[i] = new Money(current.centavos + 1n);
      remainder -= 1n;
    }

    return results;
  }
}
