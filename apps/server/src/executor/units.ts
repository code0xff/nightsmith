import { formatEther, formatUnits, maxUint256, parseEther, parseUnits } from "viem";

/** Human decimal string -> token base units. */
export function toTokenUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/** Like toTokenUnits, but the literal "max" maps to uint256-max (unlimited). */
export function toTokenUnitsOrMax(amount: string, decimals: number): bigint {
  return amount === "max" ? maxUint256 : parseUnits(amount, decimals);
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
