import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPositiveRate,
  formatKobo,
  formatNaira,
  formatUsdc,
  koboToNgn,
  ngnToKobo,
  ngnToUsdc,
  usdcToNgn,
} from "../dist/utils/currency.js";

const displayRate = 1550;

describe("currency helpers", () => {
  it("converts NGN to Kobo", () => {
    assert.equal(ngnToKobo(150), 15000);
    assert.equal(koboToNgn(15000), 150);
  });

  it("converts NGN to USDC using the configured display rate", () => {
    assert.equal(ngnToUsdc(1550, displayRate), 1);
    assert.equal(ngnToUsdc(150, displayRate), 0.096774);
  });

  it("converts USDC to NGN using the configured display rate", () => {
    assert.equal(usdcToNgn(1, displayRate), 1550);
    assert.equal(usdcToNgn(0.5, displayRate), 775);
  });

  it("formats Naira, Kobo, and USDC for the real-mode UI", () => {
    assert.equal(formatNaira(2000), "₦2,000");
    assert.equal(formatKobo(15000), "15,000 kobo");
    assert.equal(formatUsdc(0.096774), "0.096774 USDC");
  });

  it("rejects invalid exchange rates", () => {
    assert.throws(() => assertPositiveRate(0), /positive number/);
    assert.throws(() => ngnToUsdc(150, -1), /positive number/);
  });

  it("rejects negative amounts", () => {
    assert.throws(() => ngnToKobo(-1), /non-negative/);
    assert.throws(() => koboToNgn(-1), /non-negative/);
    assert.throws(() => ngnToUsdc(-1, displayRate), /non-negative/);
    assert.throws(() => usdcToNgn(-1, displayRate), /non-negative/);
  });
});
