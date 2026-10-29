-- Row-Level Security so a signed-in user reaches only their own orders. The
-- pipeline runs with the service key, which is not subject to these policies.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
