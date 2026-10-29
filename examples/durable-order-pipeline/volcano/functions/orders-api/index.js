// The standard function around the durable one: it starts executions, reports
// on them, and records a review decision.
//
// Nothing in the durable module starts an execution, so this is where the API
// calls live. Keeping them here also keeps the service key out of the browser:
// the browser calls this function, this function calls Volcano.
const { client, serviceKey, starter, unwrap } = require('./volcano');

/**
 * @import { DurableExecution, MutationBuilder, QueryBuilder, VolcanoClient } from '@volcano.dev/sdk'
 */

/**
 * The signed-in caller, which Volcano adds to the event as `__volcano_auth`.
 *
 * @typedef {object} VolcanoAuthContext
 * @property {string} user_id
 * @property {string} access_token
 */

/**
 * A request as the caller sends it. Each action reads its own fields.
 *
 * @typedef {object} OrdersRequest
 * @property {VolcanoAuthContext} [__volcano_auth]
 * @property {unknown} [action]
 * @property {OrderItemInput[]} [items]
 * @property {string} [order_id]
 * @property {string} [decision]
 */

/**
 * @typedef {object} OrderItemInput
 * @property {string} sku
 * @property {number} [quantity]
 * @property {number} [price_cents]
 */

/**
 * A row of `orders`, as volcano/migrations/001_orders.sql defines it.
 *
 * @typedef {object} OrderRow
 * @property {string} id
 * @property {string} user_id
 * @property {string} status
 * @property {string} review_status
 * @property {string | null} tracking
 * @property {string | null} execution_id
 * @property {string} created_at
 * @property {string} updated_at
 */

// `durable.start` takes a durable function's name or its id, so the name the
// manifest declares is enough and there is no id to thread through the
// environment.
const DURABLE_FUNCTION = 'order-pipeline';

/** @param {unknown} event */
exports.handler = async (event) => {
  const input = requestInput(event);
  const auth = input.__volcano_auth;
  if (auth === undefined) {
    return json(401, { error: 'sign in first' });
  }

  try {
    return await requestedAction(auth, input);
  } catch (error) {
    console.error('orders-api failed', error);
    if (error instanceof Error) {
      return json(statusOf(error), { error: error.message });
    }
    throw error;
  }
};

/**
 * @param {unknown} event
 * @returns {OrdersRequest}
 */
function requestInput(event) {
  return typeof event === 'object' && event !== null ? event : {};
}

/**
 * @param {VolcanoAuthContext} auth
 * @param {OrdersRequest} input
 */
async function requestedAction(auth, input) {
  switch (input.action) {
    case 'submit': {
      return json(202, await submitOrder(auth, input));
    }
    case 'status': {
      return json(200, await orderStatus(auth, input));
    }
    case 'review': {
      return json(200, await review(auth, input));
    }
    default: {
      return json(400, { error: "action must be 'submit', 'status' or 'review'" });
    }
  }
}

/**
 * @param {VolcanoClient} volcano
 * @param {OrderRow} order
 * @param {OrderItemInput} item
 */
async function insertOrderItem(volcano, order, item) {
  return volcano.insert('order_items', {
    order_id: order.id,
    sku: item.sku,
    quantity: item.quantity ?? 1,
    price_cents: item.price_cents ?? 0,
  });
}

// Creating the order and starting the execution are two writes, so the order id
// is the execution name: one order gets one pipeline however many times the
// start is retried. A retried *submit* is a new order and a new pipeline -- make
// the submit itself idempotent, with a client-supplied key, if that matters to
// you.
/**
 * @param {VolcanoAuthContext} auth
 * @param {OrdersRequest} input
 */
async function submitOrder(auth, input) {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    throw badRequest('an order needs at least one item');
  }

  const volcano = client(auth.access_token);
  // A builder's declared type gives `insert` the row type it returns.
  /** @type {MutationBuilder<OrderRow>} */
  const insertOrder = volcano.insert('orders', { user_id: auth.user_id, status: 'submitted' });
  const [order] = unwrap(await insertOrder);
  if (order === undefined) {
    throw new Error('the order insert returned no row');
  }
  // One item at a time, so a failed insert stops the order there instead of
  // writing the items after it.
  for (const item of items) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Stop at the first failed insert; later items are not written.
    unwrap(await insertOrderItem(volcano, order, item));
  }

  const execution = await startExecution(order.id);
  // Which execution is working an order is the pipeline's bookkeeping, not the
  // customer's, so it is written with the service key: `orders` gives a
  // signed-in user select and insert on their own rows and nothing more.
  unwrap(await client(serviceKey()).update('orders', { execution_id: execution.id }).eq('id', order.id));

  return { order_id: order.id, execution_id: execution.id, status: execution.status };
}

// A service key can start an execution, which is what makes this callable from
// any backend. Reading one cannot, so `orderStatus` reads the row this pipeline
// keeps up to date instead.
/**
 * @param {string} orderId
 * @returns {Promise<DurableExecution>}
 */
async function startExecution(orderId) {
  const { data, error, status } = await starter().durable.start(
    DURABLE_FUNCTION,
    { order_id: orderId },
    { executionName: `order-${orderId}` },
  );

  if (error !== null) {
    // 429 is the project's concurrent-execution cap: the order is recorded, so
    // the caller can submit it again later.
    throw withStatus(error, status === 429 ? 429 : 502);
  }
  // Without an error, a start answers with the execution.
  if (data === null) {
    throw withStatus(new Error('the start returned no execution'), 502);
  }
  return data;
}

// Scoped to the caller. The service key is what reads the pipeline's own
// columns -- `orders` gives a signed-in user select on their own rows only -- so
// the `user_id` filter is the authorization, not the key.
/**
 * @param {VolcanoAuthContext} auth
 * @param {OrdersRequest} input
 */
async function orderStatus(auth, input) {
  const volcano = client(serviceKey());
  // A request without an id matches no order.
  if (input.order_id === undefined) {
    throw withStatus(new Error('order not found'), 404);
  }
  /** @type {QueryBuilder<OrderRow>} */
  const orders = volcano.from('orders');
  const [order] = unwrap(await orders.select('*').eq('id', input.order_id).eq('user_id', auth.user_id).limit(1));
  if (order === undefined) {
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
//
// Scoped to the caller for the same reason as the read above. A real deployment
// reviews orders as staff rather than as the customer who placed them, which is
// a different authorization check -- a role claim on the session, say -- and not
// the absence of one.
/**
 * @param {VolcanoAuthContext} auth
 * @param {OrdersRequest} input
 */
async function review(auth, input) {
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw badRequest("decision must be 'approved' or 'rejected'");
  }
  const volcano = client(serviceKey());
  // A request without an id matches no order.
  if (input.order_id === undefined) {
    throw withStatus(new Error('order not found'), 404);
  }
  /** @type {MutationBuilder<OrderRow>} */
  const setReview = volcano.update('orders', { review_status: input.decision });
  const [order] = unwrap(await setReview.eq('id', input.order_id).eq('user_id', auth.user_id));
  if (order === undefined) {
    throw withStatus(new Error('order not found'), 404);
  }
  return { order_id: order.id, review_status: order.review_status };
}

/** @param {string} message */
function badRequest(message) {
  return withStatus(new Error(message), 400);
}

/**
 * @template {Error} E
 * @param {E} error
 * @param {number} status
 */
function withStatus(error, status) {
  return Object.assign(error, { status });
}

/**
 * The status `withStatus` gave an error, or 500 for one nothing expected.
 *
 * @param {Error} error
 * @returns {number}
 */
function statusOf(error) {
  return 'status' in error && typeof error.status === 'number' ? error.status : 500;
}

/**
 * @param {number} statusCode
 * @param {unknown} body
 */
function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}
