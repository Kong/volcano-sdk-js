DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- The pipeline inserts charges without ON CONFLICT, so this index is what
    -- holds an order to one charge. It commits with the table.
    CREATE UNIQUE INDEX IF NOT EXISTS charges_order_id_key ON charges(order_id);

    ALTER TABLE charges ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS charges_select_own ON charges;
    CREATE POLICY charges_select_own ON charges
        FOR SELECT USING (
            order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
        );
END
$$;
