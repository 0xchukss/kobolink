export function assertPositiveRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Exchange rate must be a positive number. Received: ${rate}`);
  }
}

export function ngnToKobo(ngn: number): number {
  if (!Number.isFinite(ngn) || ngn < 0) {
    throw new Error(`NGN amount must be a non-negative number. Received: ${ngn}`);
  }

  return Math.round(ngn * 100);
}

export function koboToNgn(kobo: number): number {
  if (!Number.isFinite(kobo) || kobo < 0) {
    throw new Error(`Kobo amount must be a non-negative number. Received: ${kobo}`);
  }

  return Number((kobo / 100).toFixed(2));
}

export function ngnToUsdc(ngn: number, rate: number): number {
  assertPositiveRate(rate);
  if (!Number.isFinite(ngn) || ngn < 0) {
    throw new Error(`NGN amount must be a non-negative number. Received: ${ngn}`);
  }

  return Number((ngn / rate).toFixed(6));
}

export function usdcToNgn(usdc: number, rate: number): number {
  assertPositiveRate(rate);
  if (!Number.isFinite(usdc) || usdc < 0) {
    throw new Error(`USDC amount must be a non-negative number. Received: ${usdc}`);
  }

  return Number((usdc * rate).toFixed(2));
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKobo(kobo: number): string {
  return `${new Intl.NumberFormat("en-NG").format(kobo)} kobo`;
}

export function formatUsdc(amount: number): string {
  return `${amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} USDC`;
}
