import { mixinJestEnvironment } from '@stryker-mutator/jest-runner';
import { TestEnvironment } from 'jest-environment-node';

// Remove browser storage before Jest copies host globals into its Node sandbox.
Reflect.deleteProperty(globalThis, 'localStorage');
Reflect.deleteProperty(globalThis, 'sessionStorage');

export = mixinJestEnvironment(TestEnvironment);
