/** @jest-environment node */

const {
  createVariable,
  listVariables,
  replaceSharedVariables,
  updateVariable,
} = require('../src/generated-runtime/client.js');

const DIGEST = '23519a43c66b4c342f25b32e09797ec5f3fc0be388cd8243fb3449afbdce4013';

describe('generated shared variable contract', () => {
  test.each([undefined, false, true])('preserves shared=%s on writes and reads', async (shared) => {
    const metadata = shared === undefined ? {} : { shared };
    const variable = { name: 'API_KEY', value: 'test-value', ...metadata };
    const volcanoClient = {
      _generatedFetch: jest.fn().mockImplementation(async () => Response.json(variable)),
    };
    const options = { volcanoClient, volcanoAuthorization: 'session' };

    await createVariable('project-id', variable, options);
    expect(volcanoClient._generatedFetch).toHaveBeenLastCalledWith(
      '/projects/project-id/variables',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(variable) }),
      'session',
    );

    const update = { value: 'updated-value', ...metadata };
    await updateVariable('project-id', 'API_KEY', update, options);
    expect(volcanoClient._generatedFetch).toHaveBeenLastCalledWith(
      '/projects/project-id/variables/API_KEY',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(update) }),
      'session',
    );

    volcanoClient._generatedFetch.mockResolvedValueOnce(Response.json([variable]));
    await expect(listVariables('project-id', undefined, options)).resolves.toMatchObject({
      data: [variable],
    });
  });

  test('sends the shared membership digest precondition', async () => {
    const body = {
      shared_variables: ['API_KEY', 'REGION'],
      expected_shared_variables_digest: DIGEST,
    };
    const response = new Response(null, { status: 204 });
    const volcanoClient = { _generatedFetch: jest.fn().mockResolvedValue(response) };

    await expect(
      replaceSharedVariables('project-id', body, {
        volcanoClient,
        volcanoAuthorization: 'session',
      }),
    ).resolves.toEqual({ data: undefined, status: 204, headers: response.headers });
    expect(volcanoClient._generatedFetch).toHaveBeenCalledWith(
      '/projects/project-id/shared-variables',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      'session',
    );
  });
});
