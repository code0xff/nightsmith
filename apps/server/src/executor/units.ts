import { formatEther, formatUnits, parseEther, parseUnits } from "viem";

/** Human decimal string -> token base units. */
export function toTokenUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/** Token base units -> human decimal string. */
export function fromTokenUnits(value: bigint, decimals: number): string {
  return formatUnits(value, decimals);
}

/** Human ether string -> wei. */
export function toWei(amount: string): bigint {
  return parseEther(amount);
}

/** Wei -> human ether string. */
export function fromWei(value: bigint): string {
  return formatEther(value);
}
