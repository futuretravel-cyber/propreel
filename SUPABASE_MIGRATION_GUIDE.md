# PropReel - Supabase Migration & Database Setup Guide

## 🔄 Migrating from AWS to Supabase

### Step-by-Step Migration Instructions

#### 1. Supabase Project Setup

**Create Supabase Project:**
```bash
# Go to https://supabase.com and sign in
# Click "New Project"
# Project name: propreel
# Database password: (generate a strong password)
# Region: af-south-1 (Cape Town)
# Click "Create new project"
```

**Get Your Credentials:**
- Go to Project Settings → API
- Copy these values:
  - `Project URL` (e.g., `https://xxxxx.supabase.co`)
  - `anon public key`
  - `service_role key` (keep this secret!)

#### 2. Update Environment Variables

**Create/Update `.env` file:**
```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Remove these AWS database variables:
# DATABASE_URL=postgresql://... (DELETE THIS)
# AWS_RDS_ENDPOINT=... (DELETE THIS)
```

#### 3. Create Database Tables in Supabase

**Go to Supabase Dashboard → SQL Editor**

**Run this SQL to create all tables:**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'AGENT' CHECK (role IN ('AGENT', 'AGENCY_OWNER', 'ADMIN')),
  credits INTEGER DEFAULT 0,
  credit_expiries JSONB DEFAULT '[]',
  subscription JSONB,
  auto_topup JSONB DEFAULT '{"enabled":false,"threshold":50,"amount":200}',
  agency_id UUID,
  agency_name TEXT,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  last_low_credit_warned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agencies table
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company_reg TEXT,
  company_vat TEXT,
  company_address TEXT,
  credit_pool INTEGER DEFAULT 0,
  max_agents INTEGER DEFAULT 10,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key for users.agency_id
ALTER TABLE users ADD CONSTRAINT fk_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Projects table
CREATE TABLE projects (
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
  photos JSONB DEFAULT '[]',
  description TEXT,
  social_captions JSONB DEFAULT '{}',
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
  tags JSONB DEFAULT '[]',
  favorite BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Credit transactions table
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  type TEXT NOT NULL CHECK (type IN ('RENDER', 'PURCHASE', 'SIGNUP_BONUS', 'REFUND', 'GIFT', 'TRANSFER', 'EXPIRY', 'ADMIN_GRANT', 'AGENCY_SPEND')),
  description TEXT,
  reference TEXT,
  event_id TEXT UNIQUE, -- Paystack webhook id for idempotency
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
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

-- Reviews table
CREATE TABLE reviews (
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

-- Notifications table
CREATE TABLE notifications (
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

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- App settings table (for admin configurations)
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  category TEXT DEFAULT 'GENERAL',
  is_secret BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_agency_id ON users(agency_id);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
```

#### 4. Insert Admin Users with 1000 Credits

**Run this SQL in Supabase SQL Editor:**

```sql
-- Insert admin users with 1000 credits each
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
  );

-- Insert credit transactions for the signup bonus
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
  );
```

#### 5. Enable Row Level Security (RLS)

**Run this SQL to enable RLS:**

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

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
```

#### 6. Storage Configuration

**⚠️  DO NOT create Supabase storage buckets**

**✅ All storage uses AWS S3 (configured in Step 1)**

AWS S3 buckets:
- `propreel-raw-assets` - For property images, logos, headshots
- `propreel-video-outputs-sa` - For rendered videos

Supabase is used ONLY for:
- PostgreSQL database
- Authentication (Email + Google)
- Row Level Security

File storage and CDN are handled by AWS S3 + CloudFront.

#### 7. Update Frontend Code

**Update `src/lib/supabase.ts`:**

```typescript
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export default supabase;
```

**Create `src/lib/database.types.ts`:**

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          phone: string | null
          role: 'AGENT' | 'AGENCY_OWNER' | 'ADMIN'
          credits: number
          credit_expiries: Json
          subscription: Json | null
          auto_topup: Json
          agency_id: string | null
          agency_name: string | null
          avatar_url: string | null
          email_verified: boolean
          last_low_credit_warned_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name?: string | null
          phone?: string | null
          role?: 'AGENT' | 'AGENCY_OWNER' | 'ADMIN'
          credits?: number
          credit_expiries?: Json
          subscription?: Json | null
          auto_topup?: Json
          agency_id?: string | null
          agency_name?: string | null
          avatar_url?: string | null
          email_verified?: boolean
          last_low_credit_warned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          role?: 'AGENT' | 'AGENCY_OWNER' | 'ADMIN'
          credits?: number
          credit_expiries?: Json
          subscription?: Json | null
          auto_topup?: Json
          agency_id?: string | null
          agency_name?: string | null
          avatar_url?: string | null
          email_verified?: boolean
          last_low_credit_warned_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // Add other table types...
    }
  }
}
```

#### 8. Delete AWS Database (Using Git Bash)

**⚠️ WARNING: This will permanently delete your AWS RDS database!**

```bash
# 1. Install AWS CLI if not already installed
# Download from: https://aws.amazon.com/cli/

# 2. Configure AWS CLI
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter region: af-south-1
# Enter output format: json

# 3. List your RDS instances to confirm
aws rds describe-db-instances --region af-south-1

# 4. Delete the RDS instance (replace with your instance identifier)
aws rds delete-db-instance \
  --db-instance-identifier propreel-prod-db \
  --skip-final-snapshot \
  --region af-south-1

# 5. Wait for deletion to complete (check status)
aws rds describe-db-instances \
  --db-instance-identifier propreel-prod-db \
  --region af-south-1

# 6. Delete associated security groups (optional)
aws ec2 delete-security-group \
  --group-name propreel-rds-sg \
  --region af-south-1

# 7. Delete associated subnets (optional, be careful!)
# aws ec2 delete-subnet --subnet-id subnet-xxxxx --region af-south-1

# 8. Verify deletion
aws rds describe-db-instances --region af-south-1
# Should return empty or not found
```

#### 9. Update Environment Variables

**Remove AWS database variables from `.env`:**

```bash
# DELETE THESE LINES:
# DATABASE_URL=postgresql://propreel_admin:PropreelProd2026Secure@propreel-prod-db.cr6mo60kmidc.af-south-1.rds.amazonaws.com:5432/propreel
# AWS_RDS_ENDPOINT=propreel-prod-db.cr6mo60kmidc.af-south-1.rds.amazonaws.com
# AWS_RDS_PORT=5432
# AWS_RDS_DB_NAME=propreel
# AWS_RDS_USERNAME=propreel_admin
# AWS_RDS_PASSWORD=PropreelProd2026Secure

# ADD THESE LINES:
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### 10. Test the Migration

**Run these tests:**

```bash
# 1. Start the development server
npm run dev

# 2. Test login with admin accounts
# - futuretravel@gmail.com (should have 1000 credits)
# - ulric@propreel.co.za (should have 1000 credits)

# 3. Test creating a project
# 4. Test credit deduction
# 5. Test video rendering
# 6. Check Supabase dashboard for data
```

---

## 🔧 Post-Migration Tasks

### 1. Update Backend Services

**Update API endpoints to use Supabase instead of AWS RDS:**

```typescript
// Before (AWS RDS)
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// After (Supabase)
import { supabase } from './lib/supabase';
const { data, error } = await supabase.from('users').select('*');
```

### 2. Migrate Existing Data

**If you have existing data in AWS RDS:**

```bash
# 1. Export data from AWS RDS
pg_dump -h propreel-prod-db.cr6mo60kmidc.af-south-1.rds.amazonaws.com \
  -U propreel_admin \
  -d propreel \
  -F c \
  -f propreel_backup.dump

# 2. Import to Supabase (if needed)
# Use Supabase's import tool or pg_restore
```

### 3. Update Environment Variables in Production

**Update your production environment:**

```bash
# In cPanel or Vercel dashboard:
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Remove all AWS RDS variables
```

### 4. Monitor and Verify

**Check these after migration:**
- ✅ Admin users have 1000 credits each
- ✅ New user signups work
- ✅ Credit transactions are recorded
- ✅ Projects are saved correctly
- ✅ Video renders complete successfully
- ✅ Notifications are created
- ✅ Agency features work

---

## 📊 Supabase Dashboard Features

### Monitor Your Database

**Go to Supabase Dashboard → Your Project:**

1. **Table Editor** - View and edit data directly
2. **SQL Editor** - Run custom queries
3. **Logs** - Monitor API calls and errors
4. **Authentication** - Manage users
5. **Storage** - Manage files
6. **Edge Functions** - Serverless functions
7. **Database** - Backups, replicas, performance

### Useful Queries

**Check admin credits:**
```sql
SELECT email, credits, role FROM users WHERE role = 'ADMIN';
```

**Check recent transactions:**
```sql
SELECT * FROM credit_transactions 
ORDER BY created_at DESC 
LIMIT 10;
```

**Check active subscriptions:**
```sql
SELECT u.email, s.plan_id, s.status, s.current_period_end
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE s.status = 'ACTIVE';
```

---

## 🚀 Benefits of Supabase

✅ **Real-time subscriptions** - Live updates without polling
✅ **Built-in authentication** - Email, Google, GitHub, etc.
✅ **Automatic API** - Instant REST and GraphQL APIs
✅ **Row Level Security** - Fine-grained access control
✅ **Built-in storage** - File uploads with CDN
✅ **Edge functions** - Serverless TypeScript functions
✅ **Free tier** - Generous limits for startups
✅ **South Africa region** - Low latency for SA users
✅ **PostgreSQL** - Full-featured relational database
✅ **Backups** - Automatic daily backups

---

## 📞 Support

**Supabase Documentation:** https://supabase.com/docs
**Supabase Discord:** https://discord.supabase.com
**PropReel Support:** support@propreel.co.za

---

**Migration Status:** Ready to execute
**Estimated Time:** 2-3 hours
**Risk Level:** Medium (backup first!)
**Rollback Plan:** Keep AWS RDS snapshot for 7 days
