// The standard function around the durable one: it starts executions, reports
// on them, and records a review decision.
//
// Nothing in the durable module starts an execution, and reading one is
// owner-scoped, so this is where the API calls live. Keeping them here also
// keeps the platform token out of the browser: the browser calls this function,
// this function calls Volcano.
const { VolcanoClient } = require('@volcano.dev/sdk');

const { DURABLE_FUNCTION_ID, VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY } = process.env;

exports.handler = async (event) => {
  const input = event && typeof event === 'object' ? event : {};
  const auth = input.__volcano_auth;
  if (!auth) {
    return json(401, { error: 'sign in first' });
  }

  try {
    switch (input.action) {
      case 'submit':
        return json(202, await submitOrder(auth, input));
      case 'status':
        return json(200, await orderStatus(input));
      case 'review':
        return json(200, await review(input));
      default:
        return json(400, { error: "action must be 'submit', 'status' or 'review'" });
    }
  } catch (error) {
    console.error('orders-api failed', error);
    return json(error.status ?? 500, { error: error.message });
  }
};

// Creating the order and starting the execution are two writes, so the order id
// is the execution name: a client that retries the submit resolves to the
// execution that already exists instead of starting a second pipeline.
async function submitOrder(auth, input) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    throw badRequest('an order needs at least one item');
  }

  const volcano = client(auth.access_token);
  const [order] = unwrap(
    await volcano.insert('orders', { user_id: auth.user_id, status: 'submitted' }),
  );
  for (const item of items) {
    unwrap(
      await volcano.insert('order_items', {
        order_id: order.id,
        sku: item.sku,
        quantity: item.quantity ?? 1,
        price_cents: item.price_cents ?? 0,
      }),
    );
  }

  const execution = await startExecution(order.id);
  unwrap(await volcano.update('orders', { execution_id: execution.id }).eq('id', order.id));

  return { order_id: order.id, execution_id: execution.id, status: execution.status };
}

// A service key can start an execution, which is what makes this callable from
// any backend. Reading one cannot, so `orderStatus` reads the row this pipeline
// keeps up to date instead.
async function startExecution(orderId) {
  const response = await fetch(
    `${VOLCANO_API_URL}/durable-functions/${DURABLE_FUNCTION_ID}/executions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VOLCANO_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'X-Volcano-Execution-Name': `order-${orderId}`,
      },
      body: JSON.stringify({ order_id: orderId }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 429 is the project's concurrent-execution cap: the order is recorded, so
    // the caller can submit it again later.
    throw withStatus(
      new Error(body.error ?? `starting the pipeline failed (${response.status})`),
      response.status === 429 ? 429 : 502,
    );
  }
  return body;
}

async function orderStatus(input) {
  const volcano = client(VOLCANO_SERVICE_KEY);
  const [order] = unwrap(
    await volcano.from('orders').select('*').eq('id', input.order_id).limit(1),
  );
  if (!order) {
    throw withStatus(new Error('order not found'), 404);
  }
  return {
    order_id: order.id,
    status: order.status,
    review_status: order.review_status,
    tracking: order.tracking,
  };
}

// What the pipeline's `waitUntil` is watching. The execution notices within its
// polling interval; nothing has to signal it.
async function review(input) {
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw badRequest("decision must be 'approved' or 'rejected'");
  }
  const volcano = client(VOLCANO_SERVICE_KEY);
  const [order] = unwrap(
    await volcano.update('orders', { review_status: input.decision }).eq('id', input.order_id),
  );
  if (!order) {
    throw withStatus(new Error('order not found'), 404);
  }
  return { order_id: order.id, review_status: order.review_status };
}

function client(accessToken) {
  return new VolcanoClient({
    apiUrl: VOLCANO_API_URL,
    anonKey: VOLCANO_ANON_KEY,
    accessToken,
  }).database(process.env.VOLCANO_DATABASE || 'app');
}

function unwrap({ data, error }) {
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

function badRequest(message) {
  return withStatus(new Error(message), 400);
}

function withStatus(error, status) {
  error.status = status;
  return error;
}

function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}
