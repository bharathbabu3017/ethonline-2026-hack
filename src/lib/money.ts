import { formatUnits, parseUnits } from 'viem';
import { USDC_DECIMALS, tokenBySymbol } from './chain';

/**
 * Money is integer micro-USDC (BigInt) everywhere in PayGate. It is converted
 * to a string only at the display edge, and parsed only at the input edge.
 * Nothing in between should ever see a float.
 */

export function toMicros(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error('Enter an amount like 1234.56, with at most 6 decimal places');
  }
  const micros = parseUnits(trimmed, USDC_DECIMALS);
  if (micros <= 0n) throw new Error('Amount must be greater than zero');
  return micros;
}

/** "1234.5" -> "1,234.50" */
export function formatUsdc(micros: bigint): string {
  const [whole, frac = ''] = formatUnits(micros, USDC_DECIMALS).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

export const usdcLabel = (micros: bigint) => `${formatUsdc(micros)} USDC`;

/** Raw uint256 as the hex string Privy policy conditions compare against. */
export const toPolicyHex = (micros: bigint) => `0x${micros.toString(16)}`;

/** JSON.stringify refuses BigInt; API routes serialise money as strings. */
export const microsToString = (micros: bigint) => micros.toString();

/**
 * The same helpers for any treasury asset.
 *
 * Amounts are always integers in the token's own base units — micro-USDC, wei,
 * and so on. Decimals differ per asset, so nothing may assume six.
 */
export function toBaseUnits(input: string, symbol?: string | null): bigint {
  const { decimals, symbol: sym } = tokenBySymbol(symbol);
  const trimmed = input.trim();
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(trimmed)) {
    throw new Error(`Enter an amount with at most ${decimals} decimal places for ${sym}`);
  }
  const amount = parseUnits(trimmed, decimals);
  if (amount <= 0n) throw new Error('Amount must be greater than zero');
  return amount;
}

/** Grouped and trimmed for display: 1234.5 ETH -> "1,234.5". */
export function formatAmount(base: bigint, symbol?: string | null): string {
  const { decimals, isStable } = tokenBySymbol(symbol);
  const raw = formatUnits(base, decimals);
  const [whole, frac = ''] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Stablecoins read as money, so always two places. Volatile assets keep
  // meaningful precision but drop trailing zeros.
  if (isStable) return `${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
  const trimmed = frac.slice(0, 6).replace(/0+$/, '');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export const amountLabel = (base: bigint, symbol?: string | null) =>
  `${formatAmount(base, symbol)} ${tokenBySymbol(symbol).symbol}`;
