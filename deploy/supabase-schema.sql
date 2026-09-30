-- ═══════════════════════════════════════════════════════════════════════════════
-- PROPREEL DATABASE SCHEMA - SUPABASE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════════
-- USERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'AGENT' CHECK (role IN ('AGENT', 'AGENCY_OWNER', 'ADMIN')),
  credits INTEGER DEFAULT 0,
  credit_expiries JSONB DEFAULT '[]'::jsonb,
  subscription JSONB,
  auto_topup JSONB DEFAULT '{"enabled":false,"threshold":50,"amount":200}'::jsonb,
  agency_id UUID,
  agency_name TEXT,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  last_low_credit_warned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AGENCIES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company_reg TEXT,
  company_vat TEXT,
  company_address TEXT,
  credit_pool INTEGER DEFAULT 0,
  max_agents INTEGER DEFAULT 10,
  owner_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign keys after both tables exist
ALTER TABLE users ADD CONSTRAINT fk_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE agencies ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  address TEXT,
  suburb TEXT,
  city TEXT,
  province TEXT DEFAULT 'Gauteng',
  price DECIMAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  garages INTEGER,
  floor_size INTEGER,
  erf_size INTEGER,
  property_type TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  social_captions JSONB DEFAULT '{}'::jsonb,
  video_tier TEXT DEFAULT 'ESSENTIAL',
  orientation TEXT DEFAULT 'LANDSCAPE',
  voiceover_text TEXT,
  voice_id TEXT DEFAULT 'Joanna',
  include_agent_branding BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'QUEUED', 'PROCESSING', 'READY', 'FAILED')),
  render_job_id TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  error_message TEXT,
  credits_spent INTEGER DEFAULT 0,
  folder TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  favorite BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CREDIT TRANSACTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  type TEXT NOT NULL CHECK (type IN ('RENDER', 'PURCHASE', 'SIGNUP_BONUS', 'REFUND', 'GIFT', 'TRANSFER', 'EXPIRY', 'ADMIN_GRANT', 'AGENCY_SPEND')),
  description TEXT,
  reference TEXT,
  event_id TEXT UNIQUE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('STARTER', 'PROFESSIONAL', 'PREMIUM', 'AGENCY', 'FREE')),
  cycle TEXT DEFAULT 'MONTHLY' CHECK (cycle IN ('MONTHLY', 'ANNUAL')),
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'DOWNGRADE_PENDING')),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  next_charge_amount DECIMAL,
  pending_downgrade TEXT,
  paystack_customer_code TEXT,
  paystack_subscription_code TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REVIEWS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  agency TEXT,
  location TEXT,
  approved BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('success', 'warning', 'error', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT DEFAULT 'system' CHECK (category IN ('render', 'credits', 'system', 'social', 'billing')),
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- APP SETTINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  category TEXT DEFAULT 'GENERAL',
  is_secret BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROMPT TEMPLATES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  tool TEXT NOT NULL,
  label TEXT,
  positive TEXT,
  negative TEXT,
  strength DECIMAL DEFAULT 0.30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTACT MESSAGES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  handled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_agency_id ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Users can read their own projects
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own projects
CREATE POLICY "Users can create own projects" ON projects
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own projects
CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own projects
CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (user_id = auth.uid());

-- Users can read their own transactions
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (user_id = auth.uid());

-- Users can read their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Public can read approved reviews
CREATE POLICY "Public can view approved reviews" ON reviews
  FOR SELECT USING (approved = true);

-- Users can create reviews
CREATE POLICY "Users can create reviews" ON reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Public can read active prompt templates
CREATE POLICY "Public can view active prompts" ON prompt_templates
  FOR SELECT USING (is_active = true);

-- Public can create contact messages
CREATE POLICY "Public can create contact messages" ON contact_messages
  FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_templates_updated_at BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- INSERT ADMIN USERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Insert admin users with 1000 credits
INSERT INTO users (id, email, full_name, role, credits, email_verified, created_at)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    'futuretravel@gmail.com',
    'PropReel Administrator',
    'ADMIN',
    1000,
    true,
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'ulric@propreel.co.za',
    'Ulric - PropReel Admin',
    'ADMIN',
    1000,
    true,
    NOW()
  )
ON CONFLICT (email) DO UPDATE SET
  credits = EXCLUDED.credits,
  role = EXCLUDED.role;

-- Insert credit transactions for admin users
INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, created_at)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    1000,
    1000,
    'ADMIN_GRANT',
    'Initial admin credits loaded for testing',
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    1000,
    1000,
    'ADMIN_GRANT',
    'Initial admin credits loaded for testing',
    NOW()
  )
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- INSERT DEFAULT APP SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO app_settings (key, value, category) VALUES
  ('site_name', 'PropReel', 'GENERAL'),
  ('site_tagline', 'Create Stunning Property Videos Instantly with AI', 'GENERAL'),
  ('support_email', 'support@propreel.co.za', 'GENERAL'),
  ('vat_inclusive_pricing', 'true', 'GENERAL'),
  ('signup_bonus_credits', '5', 'RENDER')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- INSERT DEFAULT PROMPT TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO prompt_templates (slug, tool, label, positive, strength, is_active) VALUES
  ('photo_editor.golden_sunset', 'photo_editor', 'Golden Sunset', 'Warm golden-hour sunset light washing over the property exterior, long soft shadows, rich amber and rose tones in the sky.', 0.25, true),
  ('photo_editor.clear_blue_sky', 'photo_editor', 'Clear Blue Sky', 'Replace the sky with a vivid, cloudless deep-blue sky, crisp midday clarity, natural neutral white balance on the building.', 0.25, true),
  ('photo_editor.lush_green_lawn', 'photo_editor', 'Lush Green Lawn', 'Revive the lawn to a dense, evenly cut emerald green with healthy growth, remove patches and dry grass.', 0.30, true),
  ('photo_editor.bright_interior', 'photo_editor', 'Bright Interior', 'Lift interior exposure with bright natural daylight from windows, clean neutral whites, no blown highlights.', 0.25, true),
  ('staging.luxury_modern', 'staging', 'Luxury Modern', 'Stage with luxury modern furniture: low-profile velvet seating, brushed brass accents, marble coffee table, oversized art.', 0.30, true),
  ('staging.scandinavian', 'staging', 'Scandinavian', 'Stage with Scandinavian furniture: light oak, cream bouclé, minimal lines, soft neutral textiles, one statement plant.', 0.30, true),
  ('staging.contemporary_dark', 'staging', 'Contemporary Dark', 'Stage with contemporary dark furniture: charcoal upholstery, black metal accents, smoked glass, moody layered lighting.', 0.30, true),
  ('removal.remove_all', 'removal', 'Remove All Furniture', 'Remove every piece of furniture from the room, leaving only the bare architectural shell, floors, walls, windows and fixtures.', 0.35, true),
  ('removal.remove_clutter', 'removal', 'Remove Clutter', 'Remove loose clutter only: papers, cables, bottles, bins, toys, and small personal items. Keep all furniture in place.', 0.35, true),
  ('twilight.blue_hour', 'twilight', 'Blue Hour', 'Convert to blue-hour twilight: deep cobalt sky with a faint horizon glow, warm tungsten interior lights, balanced exterior exposure.', 0.35, true),
  ('twilight.golden_dusk', 'twilight', 'Golden Dusk', 'Convert to golden dusk: amber-to-violet gradient sky, warm rim light on the roofline, soft glowing windows.', 0.35, true)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEMA COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════

-- This schema is ready for deployment to Supabase
-- Run this SQL in the Supabase SQL Editor or use the Supabase CLI
