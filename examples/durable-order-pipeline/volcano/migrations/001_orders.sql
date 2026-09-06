BEGIN;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid(),
    status TEXT NOT NULL DEFAULT 'submitted',
    -- What the pipeline's waitUntil polls. A reviewer flips it through
    -- orders-api; the execution notices on its next check.
    review_status TEXT NOT NULL DEFAULT 'pending',
    tracking TEXT,
    -- The handle the start returned, so an order can be traced back to the
    -- execution that is working on it.
    execution_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_cents INTEGER NOT NULL DEFAULT 0,
    packed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS charges_order_id_key ON charges(order_id);

-- Row-Level Security so a signed-in user reaches only their own orders. The
-- pipeline runs with the service key, which is not subject to these policies.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_own ON orders;
CREATE POLICY orders_select_own ON orders
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS orders_insert_own ON orders;
CREATE POLICY orders_insert_own ON orders
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS order_items_select_own ON order_items;
CREATE POLICY order_items_select_own ON order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS order_items_insert_own ON order_items;
CREATE POLICY order_items_insert_own ON order_items
    FOR INSERT WITH CHECK (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS charges_select_own ON charges;
CREATE POLICY charges_select_own ON charges
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
    );

COMMIT;
