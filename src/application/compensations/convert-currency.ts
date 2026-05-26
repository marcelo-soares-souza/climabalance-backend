export function convertUsdToBrl(
  usdValue: number,
  exchangeRate: number,
): number {
  return usdValue * exchangeRate;
}
