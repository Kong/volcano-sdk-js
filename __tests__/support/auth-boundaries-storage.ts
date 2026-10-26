interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(initial: Record<string, string>): MemoryStorage {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem(key: string, value: string): void {
      items.set(key, value);
    },
    removeItem(key: string): void {
      items.delete(key);
    },
  };
}
