import { mixinJestEnvironment } from '@stryker-mutator/jest-runner';
import { TestEnvironment } from 'jest-environment-jsdom';

class BrowserEnvironment extends TestEnvironment {
  override async setup(): Promise<void> {
    await super.setup();
    Object.assign(this.global, { Response, Headers, Request });
  }
}

export = mixinJestEnvironment(BrowserEnvironment);
