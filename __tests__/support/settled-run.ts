/**
 * Waits for a local durable run and the test driving it. A drive that fails
 * would otherwise end the test while the runner still checkpoints the
 * execution, which then fails once teardown stops the checkpoint worker.
 */
export async function settledRun<T>(execution: Promise<T>, drive: Promise<unknown>): Promise<T> {
  const [run, driven] = await Promise.allSettled([execution, drive]);
  if (driven.status === 'rejected') {
    throw driven.reason;
  }
  if (run.status === 'rejected') {
    throw run.reason;
  }
  return run.value;
}
