const responseBodyMethods = ['arrayBuffer', 'blob', 'bytes', 'formData', 'json', 'text'] as const;

const responseProperties = [
  'bodyUsed',
  'headers',
  'ok',
  'redirected',
  'status',
  'statusText',
  'type',
  'url',
] as const;

const trackBody = (
  body: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason);
    },
  });
};

export const trackResponseLifecycle = (response: Response, cleanup: () => void): Response => {
  const body = response.body;
  if (
    body === null ||
    response.status === 204 ||
    response.headers?.get?.('Content-Length') === '0'
  ) {
    cleanup();
    return response;
  }

  let trackedBody: ReadableStream<Uint8Array> | null | undefined;
  const facade = Object.create(Object.getPrototypeOf(response)) as Response;

  for (const property of responseProperties) {
    Object.defineProperty(facade, property, {
      configurable: true,
      enumerable: true,
      get: () => response[property],
    });
  }
  Object.defineProperty(facade, 'body', {
    configurable: true,
    enumerable: true,
    get() {
      if (trackedBody === undefined) {
        trackedBody =
          body && typeof body.getReader === 'function' ? trackBody(body, cleanup) : body;
      }
      return trackedBody;
    },
  });

  for (const method of responseBodyMethods) {
    const consume = response[method];
    if (typeof consume === 'function') {
      Object.defineProperty(facade, method, {
        configurable: true,
        value: (...args: unknown[]) =>
          Promise.resolve(Reflect.apply(consume, response, args)).finally(cleanup),
      });
    }
  }
  if (typeof response.clone === 'function') {
    Object.defineProperty(facade, 'clone', {
      configurable: true,
      value: response.clone.bind(response),
    });
  }

  return facade;
};

export const discardResponse = async (response: Response): Promise<void> => {
  try {
    const body = response.body;
    if (body) {
      await body.cancel();
      return;
    }
    const isNativeResponse = (response as unknown) instanceof Response;
    if (!isNativeResponse && typeof response.text === 'function') {
      await response.text();
    }
  } catch {
    // The replacement response is authoritative; discarding the old body is best-effort.
  }
};
