/** The optional runtime is validated at load time before its API is used. */
declare module '@aws/durable-execution-sdk-js' {
  const runtime: unknown;
  export = runtime;
}
