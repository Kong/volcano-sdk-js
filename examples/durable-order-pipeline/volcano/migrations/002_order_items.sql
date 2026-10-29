DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price_cents INTEGER NOT NULL DEFAULT 0,
        packed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);

    ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

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
END
$$;
