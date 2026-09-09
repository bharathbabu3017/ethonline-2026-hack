import { formatUnits, parseUnits } from 'viem';
import { USDC_DECIMALS } from './chain';

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
