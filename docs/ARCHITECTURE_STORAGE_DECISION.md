# 🏗️ PropReel Architecture - Storage Decision

## ✅ Architecture Decision: AWS S3 for All Storage

> **SUPERSEDED (3 Oct 2026):** Supabase has been removed entirely — database,
> auth and all. AWS DynamoDB is the only data store; auth is first-party
> (`lib/auth.ts`); emails go through Resend. This document is kept as history.

**Supabase storage is NOT used in this deployment.**

All file storage uses **AWS S3** exclusively, while Supabase is used ONLY for:
- PostgreSQL database
- Authentication (Email + Google OAuth)
- Row Level Security (RLS)

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                   │
│  - User Interface                                            │
│  - File Upload handling                                      │
│  - Video preview & playback                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────────┐  ┌──────────┐  ┌─────────────────┐
│   SUPABASE   │  │   MODAL  │  │      AWS        │
│              │  │          │  │                 │
│ • Database   │  │ • Video  │  │ • S3 Storage    │
│ • Auth       │  │   Render │  │ • CloudFront    │
│ • RLS        │  │ • AI     │  │ • IAM           │
│              │  │   Models │  │ • Polly (TTS)   │
└──────────────┘  └──────────┘  └─────────────────┘
```

---

## 💾 Storage Architecture

### AWS S3 Buckets (Primary Storage)

| Bucket | Purpose | Access |
|--------|---------|--------|
| `propreel-raw-assets` | Original uploads (photos, logos, headshots) | Public read |
| `propreel-video-outputs-sa` | Rendered videos | Public read |

### Why AWS S3 Instead of Supabase Storage?

1. **Cost Effective**
   - AWS S3 is cheaper for large media files
   - Better pricing for high-volume storage
   - CloudFront CDN included

2. **Performance**
   - Global CDN with CloudFront
   - Faster video delivery
   - Better for large files

3. **Features**
   - More mature storage solution
   - Better lifecycle management
   - Advanced caching options
   - Cross-region replication

4. **Integration**
   - Modal backend already uses AWS
   - Simpler architecture
   - One storage system to manage

---

## 🔄 Data Flow

### File Upload Flow
```
User uploads photo
    ↓
Frontend → AWS S3 (propreel-raw-assets)
    ↓
Supabase stores metadata (URL, project_id, user_id)
    ↓
Modal backend processes image
    ↓
AWS S3 (propreel-video-outputs-sa)
    ↓
CloudFront CDN delivers to user
```

### Video Generation Flow
```
User clicks "Generate Video"
    ↓
Frontend → Modal API
    ↓
Modal fetches images from S3
    ↓
Modal renders video
    ↓
Modal uploads to S3 (propreel-video-outputs-sa)
    ↓
Modal updates Supabase (video_url, status)
    ↓
Frontend fetches video from CloudFront
```

---

## 📋 What's Stored Where

### Supabase (Database Only)
- User accounts & profiles
- Project metadata
- Credit transactions
- Subscription data
- Reviews & ratings
- Notifications
- Audit logs
- App settings
- Prompt templates
- **File URLs** (not the files themselves)

### AWS S3 (All Files)
- Property photos (original uploads)
- Edited photos (AI-enhanced)
- Rendered videos
- User avatars
- Generated reports
- Agency logos
- Any other media files

### Modal (Processing Only)
- Temporary processing files
- Video rendering workspace
- AI model outputs
- **No persistent storage**

---

## 🔐 Security & Access Control

### AWS S3
- **Public Read**: All uploaded files are publicly accessible via URL
- **Authenticated Write**: Only authenticated users can upload
- **IAM Policies**: Fine-grained access control
- **CORS**: Configured for browser uploads
- **Versioning**: Enabled for backup/recovery

### Supabase
- **RLS Policies**: Row-level security on all tables
- **Auth**: Email + Google OAuth
- **Service Role**: Backend-only access
- **Anon Key**: Public API access (limited)

---

## 💰 Cost Comparison

### AWS S3 Pricing (af-south-1)
- Storage: $0.023 per GB/month
- Requests: $0.005 per 1,000 PUT requests
- Data Transfer: $0.14 per GB (first 10 TB)
- CloudFront: $0.085 per GB (first 10 TB)

### Supabase Storage Pricing
- Storage: $0.021 per GB/month
- Bandwidth: $0.15 per GB
- No built-in CDN

**Winner: AWS S3** (cheaper + includes CDN)

---

## 🚀 Deployment Impact

### What Changed
1. ✅ Removed Supabase storage bucket creation from deployment scripts
2. ✅ Updated documentation to clarify AWS S3 is the only storage
3. ✅ Simplified architecture (one storage system)
4. ✅ Better performance with CloudFront CDN

### What Stayed the Same
1. ✅ AWS S3 bucket creation in Step 1
2. ✅ All file upload logic uses AWS S3
3. ✅ Supabase stores only metadata (URLs)
4. ✅ Modal backend uses AWS S3

---

## 📝 Configuration

### Environment Variables

```env
# AWS S3 (Storage)
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=af-south-1
AWS_S3_RAW_BUCKET=propreel-raw-assets
AWS_S3_OUTPUT_BUCKET=propreel-video-outputs-sa
AWS_CLOUDFRONT_DOMAIN=xxxxx.cloudfront.net

# Supabase (Database + Auth Only)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx
```

### Database Schema

The `projects` table stores file URLs, not files:

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  photos JSONB,  -- Array of S3 URLs
  video_url TEXT, -- S3 URL
  thumbnail_url TEXT, -- S3 URL
  -- ... other metadata
);
```

---

## ✅ Benefits of This Architecture

1. **Simplicity**
   - One storage system (AWS S3)
   - Clear separation of concerns
   - Easier to debug

2. **Performance**
   - CloudFront CDN for fast delivery
   - Optimized for media files
   - Global edge locations

3. **Cost**
   - Cheaper storage
   - Included CDN
   - Better pricing tiers

4. **Scalability**
   - AWS S3 scales automatically
   - No storage limits
   - High availability

5. **Integration**
   - Modal backend already uses AWS
   - Consistent tooling
   - Better ecosystem

---

## 🎯 Summary

**Use AWS S3 for ALL file storage.**
**Use Supabase for database and authentication ONLY.**

This architecture is:
- ✅ Simpler
- ✅ Cheaper
- ✅ Faster
- ✅ More scalable
- ✅ Better integrated

---

## 📚 Related Documentation

- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `deploy/README.md` - Script documentation
- `deploy/supabase-schema.sql` - Database schema
- `deploy/01-aws-setup.sh` - AWS S3 setup script
- `deploy/03-supabase-setup.sh` - Supabase setup script

---

**Last Updated:** March 2025  
**Status:** ✅ Production Ready  
**Architecture:** AWS S3 + Supabase (DB/Auth) + Modal (Rendering)
