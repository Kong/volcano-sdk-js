CREATE POLICY orders_insert_own ON orders
    FOR INSERT WITH CHECK (user_id = auth.uid());
