// Everything the pipeline touches, behind one object, so the handler reads as
// the workflow it is. Each call is made inside a `ctx.step`, which is what
// makes it safe to resume.
//
// The client is created once per container and reused. It runs with the
// project's service key: a durable execution has no signed-in user, since it is
// started by a backend or a schedule rather than by a browser.
const { VolcanoClient } = require('@volcano.dev/sdk');

let client = null;

function volcano() {
  if (!client) {
    const { VOLCANO_API_URL, VOLCANO_ANON_KEY, VOLCANO_SERVICE_KEY, VOLCANO_DATABASE } =
      process.env;
    if (!VOLCANO_API_URL || !VOLCANO_ANON_KEY || !VOLCANO_SERVICE_KEY) {
      throw new Error('set VOLCANO_API_URL, VOLCANO_ANON_KEY and VOLCANO_SERVICE_KEY');
    }
    client = new VolcanoClient({
      apiUrl: VOLCANO_API_URL,
      anonKey: VOLCANO_ANON_KEY,
      accessToken: VOLCANO_SERVICE_KEY,
    }).database(VOLCANO_DATABASE || 'app');
  }
  return client;
}

function unwrap({ data, error }) {
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

const db = {
  async loadOrder(orderId) {
    const [order] = unwrap(await volcano().from('orders').select('*').eq('id', orderId).limit(1));
    if (!order) {
      return null;
    }
    const items = unwrap(await volcano().from('order_items').select('*').eq('order_id', orderId));
    return { ...order, items };
  },

  // Stands in for a payment provider. A real one goes here, called the same
  // way — inside the `atMostOnce` step that wraps this.
  async charge(order) {
    const total = order.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    const [charge] = unwrap(
      await volcano().insert('charges', {
        order_id: order.id,
        amount_cents: total,
        status: 'captured',
      }),
    );
    return charge;
  },

  async refund(chargeId) {
    const [charge] = unwrap(
      await volcano().update('charges', { status: 'refunded' }).eq('id', chargeId),
    );
    return charge;
  },

  async packItem(orderId, item) {
    unwrap(
      await volcano()
        .update('order_items', { packed_at: new Date().toISOString() })
        .eq('id', item.id),
    );
    return { order_id: orderId, item_id: item.id, sku: item.sku };
  },

  async reviewStatus(orderId) {
    const [order] = unwrap(
      await volcano().from('orders').select('review_status').eq('id', orderId).limit(1),
    );
    return order?.review_status ?? 'pending';
  },

  async dispatch(order, packedItems) {
    const tracking = `TRK-${order.id.slice(0, 8).toUpperCase()}`;
    unwrap(await volcano().update('orders', { tracking }).eq('id', order.id));
    return { tracking, items: packedItems.length };
  },

  async setStatus(orderId, status) {
    unwrap(await volcano().update('orders', { status }).eq('id', orderId));
    return status;
  },
};

module.exports = { db };
