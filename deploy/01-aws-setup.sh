#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - STEP 1: AWS CLI SETUP & CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL DEPLOYMENT - AWS CLI SETUP                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Installing..."
    
    # Detect OS
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows (Git Bash)
        echo "Installing AWS CLI for Windows..."
        curl "https://awscli.amazonaws.com/AWSCLIV2.msi" -o "AWSCLIV2.msi"
        msiexec //i AWSCLIV2.msi //quiet //norestart
        rm AWSCLIV2.msi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "Installing AWS CLI for macOS..."
        curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
        sudo installer -pkg AWSCLIV2.pkg -target /
        rm AWSCLIV2.pkg
    else
        # Linux
        echo "Installing AWS CLI for Linux..."
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
        unzip awscliv2.zip
        sudo ./aws/install
        rm -rf aws awscliv2.zip
    fi
    
    echo "✅ AWS CLI installed successfully"
else
    echo "✅ AWS CLI already installed"
fi

# Verify AWS CLI version
echo ""
echo "AWS CLI Version:"
aws --version
echo ""

# Configure AWS CLI
echo "═══════════════════════════════════════════════════════════════════"
echo "CONFIGURING AWS CLI"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "You will need your AWS credentials from the AWS Console."
echo "Get them from: https://console.aws.amazon.com/iam/home#/security_credentials"
echo ""

# Check if already configured
if [ -f ~/.aws/credentials ]; then
    echo "⚠️  AWS credentials already exist."
    read -p "Do you want to reconfigure? (y/n): " reconfigure
    if [ "$reconfigure" != "y" ]; then
        echo "Skipping AWS configuration..."
    else
        aws configure
    fi
else
    echo "Configuring AWS CLI..."
    aws configure
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "VERIFYING AWS CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test AWS credentials
echo "Testing AWS credentials..."
if aws sts get-caller-identity &> /dev/null; then
    echo "✅ AWS credentials are valid"
    aws sts get-caller-identity --output table
else
    echo "❌ AWS credentials are invalid or expired"
    echo "Please run 'aws configure' again with correct credentials"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CREATING S3 BUCKETS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Define bucket names
RAW_BUCKET="propreel-raw-assets"
OUTPUT_BUCKET="propreel-video-outputs-sa"
REGION="af-south-1"

# Create raw assets bucket
echo "Creating S3 bucket: $RAW_BUCKET"
if aws s3api head-bucket --bucket "$RAW_BUCKET" 2>/dev/null; then
    echo "⚠️  Bucket $RAW_BUCKET already exists"
else
    aws s3api create-bucket \
        --bucket "$RAW_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    echo "✅ Bucket $RAW_BUCKET created"
fi

# Create output bucket
echo "Creating S3 bucket: $OUTPUT_BUCKET"
if aws s3api head-bucket --bucket "$OUTPUT_BUCKET" 2>/dev/null; then
    echo "⚠️  Bucket $OUTPUT_BUCKET already exists"
else
    aws s3api create-bucket \
        --bucket "$OUTPUT_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    echo "✅ Bucket $OUTPUT_BUCKET created"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CONFIGURING S3 BUCKET POLICIES"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Enable versioning on raw bucket
echo "Enabling versioning on $RAW_BUCKET..."
aws s3api put-bucket-versioning \
    --bucket "$RAW_BUCKET" \
    --versioning-configuration Status=Enabled
echo "✅ Versioning enabled"

# Enable versioning on output bucket
echo "Enabling versioning on $OUTPUT_BUCKET..."
aws s3api put-bucket-versioning \
    --bucket "$OUTPUT_BUCKET" \
    --versioning-configuration Status=Enabled
echo "✅ Versioning enabled"

# Set public access block (allow public read)
echo "Configuring public access for $RAW_BUCKET..."
aws s3api put-public-access-block \
    --bucket "$RAW_BUCKET" \
    --public-access-block-configuration \
        BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
echo "✅ Public access configured"

echo "Configuring public access for $OUTPUT_BUCKET..."
aws s3api put-public-access-block \
    --bucket "$OUTPUT_BUCKET" \
    --public-access-block-configuration \
        BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
echo "✅ Public access configured"

# Set bucket policies for public read
echo "Setting bucket policy for $RAW_BUCKET..."
aws s3api put-bucket-policy \
    --bucket "$RAW_BUCKET" \
    --policy "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [
            {
                \"Sid\": \"PublicReadGetObject\",
                \"Effect\": \"Allow\",
                \"Principal\": \"*\",
                \"Action\": \"s3:GetObject\",
                \"Resource\": \"arn:aws:s3:::$RAW_BUCKET/*\"
            }
        ]
    }"
echo "✅ Bucket policy set"

echo "Setting bucket policy for $OUTPUT_BUCKET..."
aws s3api put-bucket-policy \
    --bucket "$OUTPUT_BUCKET" \
    --policy "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [
            {
                \"Sid\": \"PublicReadGetObject\",
                \"Effect\": \"Allow\",
                \"Principal\": \"*\",
                \"Action\": \"s3:GetObject\",
                \"Resource\": \"arn:aws:s3:::$OUTPUT_BUCKET/*\"
            }
        ]
    }"
echo "✅ Bucket policy set"

# Enable CORS for browser uploads
echo "Configuring CORS for $RAW_BUCKET..."
aws s3api put-bucket-cors \
    --bucket "$RAW_BUCKET" \
    --cors-configuration '{
        "CORSRules": [
            {
                "AllowedOrigins": ["*"],
                "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
                "AllowedHeaders": ["*"],
                "MaxAgeSeconds": 3000
            }
        ]
    }'
echo "✅ CORS configured"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CREATING IAM USER FOR APPLICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

IAM_USER="propreel-app-user"

# Check if user exists
if aws iam get-user --user-name "$IAM_USER" &> /dev/null; then
    echo "⚠️  IAM user $IAM_USER already exists"
else
    echo "Creating IAM user: $IAM_USER"
    aws iam create-user --user-name "$IAM_USER"
    echo "✅ IAM user created"
fi

# Attach S3 full access policy
echo "Attaching S3 access policy..."
aws iam attach-user-policy \
    --user-name "$IAM_USER" \
    --policy-arn "arn:aws:iam::aws:policy/AmazonS3FullAccess"
echo "✅ S3 access granted"

# Attach Polly access policy
echo "Attaching Polly access policy..."
aws iam attach-user-policy \
    --user-name "$IAM_USER" \
    --policy-arn "arn:aws:iam::aws:policy/AmazonPollyFullAccess"
echo "✅ Polly access granted"

# Create access keys
echo "Creating access keys..."
ACCESS_KEY_OUTPUT=$(aws iam create-access-key --user-name "$IAM_USER")

# Parse JSON output (try jq first, fall back to Python)
if command -v jq &> /dev/null; then
    ACCESS_KEY_ID=$(echo $ACCESS_KEY_OUTPUT | jq -r '.AccessKey.AccessKeyId')
    SECRET_ACCESS_KEY=$(echo $ACCESS_KEY_OUTPUT | jq -r '.AccessKey.SecretAccessKey')
else
    # Fallback to Python for JSON parsing
    ACCESS_KEY_ID=$(echo $ACCESS_KEY_OUTPUT | python3 -c "import sys, json; print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")
    SECRET_ACCESS_KEY=$(echo $ACCESS_KEY_OUTPUT | python3 -c "import sys, json; print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")
fi

echo "✅ Access keys created"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "AWS CREDENTIALS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID"
echo "AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY"
echo "AWS_REGION=$REGION"
echo "AWS_S3_RAW_BUCKET=$RAW_BUCKET"
echo "AWS_S3_OUTPUT_BUCKET=$OUTPUT_BUCKET"
echo ""
echo "⚠️  SAVE THESE CREDENTIALS SECURELY!"
echo "⚠️  You will need them for the .env file"
echo ""

# Save credentials to a secure file
mkdir -p deploy/credentials
cat > deploy/credentials/aws-credentials.txt << EOF
AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY
AWS_REGION=$REGION
AWS_S3_RAW_BUCKET=$RAW_BUCKET
AWS_S3_OUTPUT_BUCKET=$OUTPUT_BUCKET
EOF

chmod 600 deploy/credentials/aws-credentials.txt
echo "✅ Credentials saved to deploy/credentials/aws-credentials.txt"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "AWS SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Next step: Run ./deploy/02-modal-setup.sh"
echo ""
