// Everything the pipeline touches, behind one object, so the handler reads as
// the workflow it is. Each call is made inside a `ctx.step`, which is what
// makes it safe to resume.
//
// The client is created once per container and reused. It runs with the
// project's service key: a durable execution has no signed-in user, since it is
// started by a backend or a schedule rather than by a browser.
const { VolcanoClient } = require('@volcano.dev/sdk');

/**
 * @import { MutationBuilder, QueryBuilder, QueryResult } from '@volcano.dev/sdk'
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

/**
 * A row of `order_items`.
 *
 * @typedef {object} OrderItemRow
 * @property {string} id
 * @property {string} order_id
 * @property {string} sku
 * @property {number} quantity
 * @property {number} price_cents
 * @property {string | null} packed_at
 */

/**
 * A row of `charges`.
 *
 * @typedef {object} ChargeRow
 * @property {string} id
 * @property {string} order_id
 * @property {number} amount_cents
 * @property {string} status
 * @property {string} created_at
 */

/** @typedef {OrderRow & { items: OrderItemRow[] }} Order */

/**
 * @typedef {object} PackedItem
 * @property {string} order_id
 * @property {string} item_id
 * @property {string} sku
 */

/** @type {VolcanoClient | null} */
let client = null;

/**
 * An unset variable and an empty one are both missing.
 *
 * @param {string | undefined} value
 * @returns {value is undefined | ''}
 */
function isMissing(value) {
  return value === undefined || value === '';
}

function databaseSettings() {
  const { VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY, VOLCANO_DATABASE } = process.env;
  if (isMissing(VOLCANO_API_URL) || isMissing(VOLCANO_ANON_KEY) || isMissing(VOLCANO_SERVICE_KEY)) {
    throw new Error('set VOLCANO_API_URL, VOLCANO_ANON_KEY and VOLCANO_SERVICE_KEY');
  }
  return { VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY, VOLCANO_DATABASE };
}

function volcano() {
  if (client === null) {
    const { VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY, VOLCANO_DATABASE } = databaseSettings();
    client = new VolcanoClient({
      apiUrl: VOLCANO_API_URL,
      anonKey: VOLCANO_ANON_KEY,
      accessToken: VOLCANO_SERVICE_KEY,
    }).database(isMissing(VOLCANO_DATABASE) ? 'app' : VOLCANO_DATABASE);
  }
  return client;
}

/**
 * @template Row
 * @param {QueryResult<Row>} result
 * @returns {Row[]}
 */
function unwrap({ data, error }) {
  if (error !== null) {
    throw new Error(error.message);
  }
  return data ?? [];
}

// A builder's declared type is what gives `from`, `insert` and `update` the
// row type of the table they query.
const db = {
  /**
   * @param {string} orderId
   * @returns {Promise<Order | null>}
   */
  async loadOrder(orderId) {
    /** @type {QueryBuilder<OrderRow>} */
    const orders = volcano().from('orders');
    const [order] = unwrap(await orders.select('*').eq('id', orderId).limit(1));
    if (order === undefined) {
      return null;
    }
    /** @type {QueryBuilder<OrderItemRow>} */
    const orderItems = volcano().from('order_items');
    const items = unwrap(await orderItems.select('*').eq('order_id', orderId));
    return { ...order, items };
  },

  // Stands in for a payment provider. A real one goes here, called the same
  // way — inside the `atMostOnce` step that wraps this.
  /**
   * @param {Order} order
   * @returns {Promise<ChargeRow>}
   */
  async charge(order) {
    const total = order.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    /** @type {MutationBuilder<ChargeRow>} */
    const insert = volcano().insert('charges', {
      order_id: order.id,
      amount_cents: total,
      status: 'captured',
    });
    const [charge] = unwrap(await insert);
    if (charge === undefined) {
      throw new Error(`the charge for order ${order.id} returned no row`);
    }
    return charge;
  },

  /**
   * @param {string} chargeId
   * @returns {Promise<ChargeRow | undefined>}
   */
  async refund(chargeId) {
    /** @type {MutationBuilder<ChargeRow>} */
    const update = volcano().update('charges', { status: 'refunded' });
    const [charge] = unwrap(await update.eq('id', chargeId));
    return charge;
  },

  /**
   * @param {string} orderId
   * @param {OrderItemRow} item
   * @returns {Promise<PackedItem>}
   */
  async packItem(orderId, item) {
    unwrap(await volcano().update('order_items', { packed_at: new Date().toISOString() }).eq('id', item.id));
    return { order_id: orderId, item_id: item.id, sku: item.sku };
  },

  /**
   * @param {string} orderId
   * @returns {Promise<string>}
   */
  async reviewStatus(orderId) {
    /** @type {QueryBuilder<Pick<OrderRow, 'review_status'>>} */
    const orders = volcano().from('orders');
    const [order] = unwrap(await orders.select('review_status').eq('id', orderId).limit(1));
    return order?.review_status ?? 'pending';
  },

  /**
   * @param {Order} order
   * @param {PackedItem[]} packedItems
   */
  async dispatch(order, packedItems) {
    const tracking = `TRK-${order.id.slice(0, 8).toUpperCase()}`;
    unwrap(await volcano().update('orders', { tracking }).eq('id', order.id));
    return { tracking, items: packedItems.length };
  },

  /**
   * @param {string} orderId
   * @param {string} status
   */
  async setStatus(orderId, status) {
    unwrap(await volcano().update('orders', { status }).eq('id', orderId));
    return status;
  },
};

module.exports = { db };
