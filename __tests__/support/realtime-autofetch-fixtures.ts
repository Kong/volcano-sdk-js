import { jest } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';

export const fetchMock = jest.mocked(globalThis.fetch);

interface MockVolcanoClient {
  client: VolcanoAuth;
  databaseSpy: jest.SpiedFunction<VolcanoAuth['database']>;
  fromSpy: jest.SpiedFunction<VolcanoAuth['from']>;
}

/** Takes the auth class from the test so it comes from the built SDK that Jest maps `../src/index.ts` to. */
export function mockVolcanoClientFactory(
  Auth: typeof VolcanoAuth,
): (mockData?: Record<string, unknown>[]) => MockVolcanoClient {
  return (mockData = []) => {
    const client = new Auth({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
      accessToken: 'token123',
    });
    const databaseSpy = jest.spyOn(client, 'database');
    const fromSpy = jest.spyOn(client, 'from');
    fetchMock.mockResolvedValue(Response.json({ data: mockData }));
    return { client, databaseSpy, fromSpy };
  };
}
