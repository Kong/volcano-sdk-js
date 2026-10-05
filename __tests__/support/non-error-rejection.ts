/** Model a third-party transport that rejects with a non-Error value. */
export function rejectWithForeignValue(reason: unknown): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const rejectTransport: (value: unknown) => void = reject;
    rejectTransport(reason);
  });
}
