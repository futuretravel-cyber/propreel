-- Credit Expiries Table
-- Tracks when credits expire (FIFO system)

CREATE TABLE IF NOT EXISTS credit_expiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('subscription', 'purchase', 'gift', 'bonus', 'refund')),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_expiries_user_id ON credit_expiries(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_expiries_expires_at ON credit_expiries(expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_expiries_processed ON credit_expiries(processed);
CREATE INDEX IF NOT EXISTS idx_credit_expiries_source ON credit_expiries(source);

-- RLS Policies
ALTER TABLE credit_expiries ENABLE ROW LEVEL SECURITY;

-- Users can view their own expiries
CREATE POLICY "Users can view own expiries" ON credit_expiries
  FOR SELECT USING (user_id = auth.uid());

-- Admins can view all expiries
CREATE POLICY "Admins can view all expiries" ON credit_expiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Service role can insert/update (for cron jobs)
CREATE POLICY "Service role can manage expiries" ON credit_expiries
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
