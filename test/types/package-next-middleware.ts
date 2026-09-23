import {
  createServerClient as createEsmClient,
  type ServerClient,
  withAuth as withEsmAuth,
} from '../../dist/next/middleware.esm.mjs';
import {
  createServerClient as createCjsClient,
  type ServerClientConfig,
  type User,
  withAuth as withCjsAuth,
} from '../../dist/next/middleware.js';

const config: ServerClientConfig = { anonKey: 'anon' };
const cjsClient: ServerClient = createCjsClient(config);
const esmClient: ServerClient = createEsmClient(config);

export async function loadMiddlewareUser(request: Request): Promise<User | null> {
  const cjsUser = await withCjsAuth(request, cjsClient);
  return cjsUser ?? withEsmAuth(request, esmClient);
}
