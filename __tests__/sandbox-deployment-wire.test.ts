import { expect, test } from '@jest/globals';
import { buildConfiguration, cursorOptions, logOptions } from '../src/sandbox-deployment-wire.ts';

test('omits absent options from the generated-client contract', () => {
  expect(buildConfiguration({ name: 'app' })).toStrictEqual({});
  expect(cursorOptions({})).toStrictEqual({});
  expect(logOptions({ region: 'aws-us-east-1' })).toStrictEqual({ region: 'aws-us-east-1' });
});

test('preserves present configuration and pagination options', () => {
  expect(buildConfiguration({ name: 'app', memoryMB: 1024, ports: [] })).toStrictEqual({
    memory_mb: 1024,
    ports: '[]',
  });
  expect(cursorOptions({ cursor: '', limit: 1 })).toStrictEqual({ cursor: '', limit: 1 });
  expect(logOptions({ region: 'aws-us-east-1', cursor: '', limit: 1 })).toStrictEqual({
    region: 'aws-us-east-1',
    cursor: '',
    limit: 1,
  });
});
