/** Thrown when a durable handler runs without the cloud durable runtime. */
export class DurableRuntimeMissingError extends Error {
  override name = 'DurableRuntimeMissingError' as const;
  override cause: unknown;

  constructor(cause?: unknown) {
    super(
      'Durable execution is not available here. Volcano provides the durable runtime when it ' +
        'builds a function deployed as durable, so deploy this one that way ' +
        '(`volcano cloud durable deploy`, or `kind: durable` in volcano-config.yaml). ' +
        'Durable execution is a cloud capability and does not run locally.',
    );
    this.cause = cause;
  }
}
