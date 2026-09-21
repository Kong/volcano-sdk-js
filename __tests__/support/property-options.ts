export function propertyOptions(): { numRuns: number; seed?: number } {
  const configured = process.env['VOLCANO_PROPERTY_SEED'];
  if (configured === undefined) {
    return { numRuns: 200 };
  }
  const seed = Number(configured);
  if (configured.trim() === '' || !Number.isSafeInteger(seed)) {
    throw new Error('VOLCANO_PROPERTY_SEED must be an integer');
  }
  return { numRuns: 200, seed };
}
