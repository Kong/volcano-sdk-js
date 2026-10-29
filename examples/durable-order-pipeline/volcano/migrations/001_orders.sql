-- Volcano runs each migration file as one query, which must hold one
-- statement. Each file is one DO block, so a table, its indexes, Row-Level
-- Security, and policies commit together or not at all, and the file is safe
-- to run again on its own.
DO $$
BEGIN
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

    CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);

    -- Row-Level Security so a signed-in user reaches only their own orders. The
    -- pipeline runs with the service key, which is not subject to these policies.
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS orders_select_own ON orders;
    CREATE POLICY orders_select_own ON orders
        FOR SELECT USING (user_id = auth.uid());

    DROP POLICY IF EXISTS orders_insert_own ON orders;
    CREATE POLICY orders_insert_own ON orders
        FOR INSERT WITH CHECK (user_id = auth.uid());
END
$$;
