export function secureRandomUnit(): number {
  const buffer = new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
  crypto.getRandomValues(new Uint8Array(buffer));
  return new DataView(buffer).getUint32(0) / 0x1_0000_0000;
}
