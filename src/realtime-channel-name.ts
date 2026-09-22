export function sdkChannelFromParts(parts: readonly string[]): string | null {
  return parts.length < 3 ? null : parts.slice(1).join(':');
}

export function postgresBaseChannelFromParts(parts: readonly string[]): string | null {
  if (parts.length !== 5 || parts[1] !== 'postgres') {
    return null;
  }
  return parts.slice(1, -1).join(':');
}
