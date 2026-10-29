-- Volcano runs each migration file as one query, which must hold a single
-- statement, so the indexes, Row-Level Security, and policies follow in their
-- own files. Every file runs again on each `--all`, so each is safe to repeat.
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
