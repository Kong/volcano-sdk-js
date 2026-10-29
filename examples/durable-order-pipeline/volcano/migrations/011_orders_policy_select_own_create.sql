CREATE POLICY orders_select_own ON orders
    FOR SELECT USING (user_id = auth.uid());
