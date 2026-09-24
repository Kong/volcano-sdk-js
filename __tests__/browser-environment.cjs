const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;
const { mixinJestEnvironment } = require('@stryker-mutator/jest-runner');

class BrowserEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();
    this.global.Response = Response;
    this.global.Headers = Headers;
    this.global.Request = Request;
  }
}

module.exports = mixinJestEnvironment(BrowserEnvironment);
