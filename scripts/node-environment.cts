import { mixinJestEnvironment } from '@stryker-mutator/jest-runner';
import { TestEnvironment } from 'jest-environment-node';

// Remove browser storage before Jest copies host globals into its Node sandbox.
Reflect.deleteProperty(globalThis, 'localStorage');
Reflect.deleteProperty(globalThis, 'sessionStorage');

// Stop the timers a test file leaves behind when its environment closes, as
// jsdom does. A test that fails early can abandon an SDK request on its
// 60-second timeout; in a reused Stryker worker, that request would resume
// during a later mutant's run and report its error there.
class NodeEnvironment extends TestEnvironment {
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(...options: ConstructorParameters<typeof TestEnvironment>) {
    super(...options);
    const { setInterval: startInterval, setTimeout: startTimeout } = this.global;
    Object.assign(this.global, {
      setInterval: (callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
        this.track(startInterval(callback, ms, ...args)),
      setTimeout: (callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
        this.track(startTimeout(callback, ms, ...args)),
    });
  }

  override async teardown(): Promise<void> {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    await super.teardown();
  }

  private track(timer: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(timer);
    return timer;
  }
}

export = mixinJestEnvironment(NodeEnvironment);
