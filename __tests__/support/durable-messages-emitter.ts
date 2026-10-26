type Listener = (context: unknown) => void;

export class Emitter {
  readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }
}
