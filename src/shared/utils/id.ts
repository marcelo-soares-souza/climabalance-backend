function toHex(value: number, length: number): string {
  return value.toString(16).padStart(length, '0');
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

export function uuidv7(): string {
  const ts = BigInt(Date.now());
  const timeHigh = Number((ts >> 16n) & 0xffffffffn);
  const timeLow = Number(ts & 0xffffn);

  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);

  const randA = ((randomBytes[0] << 4) | (randomBytes[1] >> 4)) & 0x0fff;
  const randB = bytesToBigInt(randomBytes.slice(2, 10)) & ((1n << 62n) - 1n);

  const timeHighHex = toHex(timeHigh, 8);
  const timeLowHex = toHex(timeLow, 4);
  const randAHex = toHex(0x7000 | randA, 4);

  const randBHigh = Number((randB >> 48n) & 0x3fffn);
  const randBLow = randB & 0xffffffffffffn;
  const randBHighHex = toHex(0x8000 | randBHigh, 4);
  const randBLowHex = randBLow.toString(16).padStart(12, '0');

  return `${timeHighHex}-${timeLowHex}-${randAHex}-${randBHighHex}-${randBLowHex}`;
}
