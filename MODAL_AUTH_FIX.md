# Modal Authentication Fix

## Issue

The deployment script was using an outdated Modal CLI command:
```bash
modal token create  # ❌ This command doesn't exist
```

## Solution

Updated to use the correct Modal authentication command:
```bash
modal setup  # ✅ Correct command
```

## What Changed

### 1. Updated `deploy/02-modal-setup.sh`

- Changed authentication check from `modal token inspect` to `modal whoami`
- Changed authentication command from `modal token create` to `modal setup`
- Added better error handling and verification
- Added fallback to create basic Modal app if file doesn't exist

### 2. Created `modal/app_propreel_grok_tiers.py`

Full Modal backend implementation with:
- Video rendering from property images
- AWS Polly voiceover generation
- S3 upload integration
- Support for all 4 video tiers (Essential, Social, Cinematic, Premium)
- Health check endpoint

### 3. Created `modal/README.md`

Complete documentation for the Modal backend including:
- Setup instructions
- API documentation
- Troubleshooting guide
- Cost estimation

## Next Steps

### Step 1: Authenticate with Modal

Run the deployment script again:
```bash
./deploy/02-modal-setup.sh
```

When prompted, it will:
1. Open your browser to https://modal.com
2. Ask you to log in or create an account
3. Generate an authentication token
4. Save the token locally

### Step 2: Configure AWS Secrets

After authentication, you need to create a Modal secret for AWS credentials:

```bash
modal secret create aws-credentials \
  AWS_ACCESS_KEY_ID=your_access_key \
  AWS_SECRET_ACCESS_KEY=your_secret_key \
  AWS_REGION=af-south-1
```

Replace `your_access_key` and `your_secret_key` with the credentials from `deploy/credentials/aws-credentials.txt`.

### Step 3: Deploy Modal Backend

The script will automatically deploy the Modal backend after authentication.

If you need to deploy manually:
```bash
cd modal
modal deploy app_propreel_grok_tiers.py
cd ..
```

### Step 4: Get Your Endpoint URL

After deployment, Modal will output your endpoint URL:
```
✓ Created function render_video
✓ Created function health_check

✓ Deployment complete!

Endpoint: https://your-username--propreel-render.modal.run
```

Save this URL and update your `.env` file:
```env
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run
```

## Verification

Test the deployment:

```bash
# Check health
curl https://your-username--propreel-render.modal.run/health

# Expected response:
# {"status": "healthy", "service": "propreel-render"}
```

## Troubleshooting

### "modal: command not found"

Install Modal CLI:
```bash
pip install modal
```

### Authentication fails

Try clearing Modal credentials and re-authenticating:
```bash
modal token clear
modal setup
```

### Deployment fails

Check:
1. You're logged in: `modal whoami`
2. AWS secrets are configured: `modal secret list`
3. Modal app file exists: `ls modal/app_propreel_grok_tiers.py`

### "No module named 'modal'"

This means Python can't find Modal. Try:
```bash
python3 -m pip install modal
```

Or use the full path:
```bash
python3 -m modal setup
```

## Modal CLI Commands Reference

| Command | Description |
|---------|-------------|
| `modal setup` | Authenticate with Modal |
| `modal whoami` | Check current user |
| `modal deploy <file>` | Deploy a Modal app |
| `modal run <file>` | Run locally for testing |
| `modal secret create <name>` | Create a secret |
| `modal secret list` | List all secrets |
| `modal app list` | List deployed apps |
| `modal app stop <name>` | Stop an app |

## Cost Management

Modal charges based on usage:
- CPU time: ~$0.0001/second
- Memory: ~$0.00005/GB-second
- GPU time: ~$0.0005/second (if used)

Monitor usage:
```bash
modal usage
```

Set budget alerts in the Modal dashboard:
https://modal.com/dashboard

## Support

- Modal docs: https://modal.com/docs
- Modal support: support@modal.com
- PropReel support: support@propreel.co.za
