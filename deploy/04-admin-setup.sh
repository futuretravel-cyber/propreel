#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - STEP 4: ADMIN USERS & CREDITS SETUP
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL DEPLOYMENT - ADMIN USERS SETUP                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Load credentials
if [ -f "deploy/credentials/supabase-credentials.txt" ]; then
    source deploy/credentials/supabase-credentials.txt
    echo "✅ Loaded Supabase credentials"
else
    echo "❌ Supabase credentials not found"
    echo "Please run ./deploy/03-supabase-setup.sh first"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CREATING ADMIN USERS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Define admin users
ADMIN_EMAILS=("futuretravel@gmail.com" "ulric@propreel.co.za")
ADMIN_CREDITS=1000

for email in "${ADMIN_EMAILS[@]}"; do
    echo "Creating admin user: $email"
    
    # Check if user exists
    USER_EXISTS=$(curl -s -X GET "$SUPABASE_URL/rest/v1/users?email=eq.$email" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq length)
    
    if [ "$USER_EXISTS" -gt 0 ]; then
        echo "⚠️  User $email already exists"
        
        # Update credits
        echo "Updating credits to $ADMIN_CREDITS..."
        curl -s -X PATCH "$SUPABASE_URL/rest/v1/users?email=eq.$email" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d "{\"credits\": $ADMIN_CREDITS, \"role\": \"ADMIN\"}"
        
        echo "✅ Credits updated for $email"
    else
        echo "Creating new admin user..."
        
        # Generate a temporary password
        TEMP_PASSWORD=$(openssl rand -base64 12)
        
        # Create user via Supabase Auth
        AUTH_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$email\",
                \"password\": \"$TEMP_PASSWORD\",
                \"email_confirm\": true,
                \"user_metadata\": {
                    \"full_name\": \"PropReel Administrator\",
                    \"role\": \"ADMIN\"
                }
            }")
        
        USER_ID=$(echo $AUTH_RESPONSE | jq -r '.id')
        
        if [ "$USER_ID" != "null" ]; then
            echo "✅ Auth user created: $USER_ID"
            
            # Create user profile in users table
            curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
                -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
                -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
                -H "Content-Type: application/json" \
                -H "Prefer: return=minimal" \
                -d "{
                    \"id\": \"$USER_ID\",
                    \"email\": \"$email\",
                    \"full_name\": \"PropReel Administrator\",
                    \"role\": \"ADMIN\",
                    \"credits\": $ADMIN_CREDITS,
                    \"credit_expiries\": [],
                    \"auto_topup\": {\"enabled\": false, \"threshold\": 50, \"amount\": 200},
                    \"email_verified\": true
                }"
            
            echo "✅ User profile created with $ADMIN_CREDITS credits"
            
            # Create credit transaction
            curl -s -X POST "$SUPABASE_URL/rest/v1/credit_transactions" \
                -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
                -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
                -H "Content-Type: application/json" \
                -H "Prefer: return=minimal" \
                -d "{
                    \"user_id\": \"$USER_ID\",
                    \"amount\": $ADMIN_CREDITS,
                    \"balance_after\": $ADMIN_CREDITS,
                    \"type\": \"ADMIN_GRANT\",
                    \"description\": \"Initial admin credits loaded for testing\"
                }"
            
            echo "✅ Credit transaction recorded"
            
            # Save temporary password
            echo "$email:$TEMP_PASSWORD" >> deploy/credentials/admin-passwords.txt
            echo "⚠️  Temporary password saved to deploy/credentials/admin-passwords.txt"
        else
            echo "❌ Failed to create user: $email"
            echo "Error: $AUTH_RESPONSE"
        fi
    fi
    
    echo ""
done

chmod 600 deploy/credentials/admin-passwords.txt

echo "═══════════════════════════════════════════════════════════════════"
echo "ADMIN USERS SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Admin users created:"
echo ""

for email in "${ADMIN_EMAILS[@]}"; do
    echo "  Email: $email"
    echo "  Credits: $ADMIN_CREDITS"
    echo "  Role: ADMIN"
    echo ""
done

echo "⚠️  IMPORTANT: Change these passwords immediately after first login!"
echo ""
echo "Temporary passwords saved to: deploy/credentials/admin-passwords.txt"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "VERIFYING ADMIN USERS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Verify users were created
echo "Checking admin users in database..."
for email in "${ADMIN_EMAILS[@]}"; do
    USER_CHECK=$(curl -s -X GET "$SUPABASE_URL/rest/v1/users?email=eq.$email&select=id,email,credits,role" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
    
    USER_COUNT=$(echo $USER_CHECK | jq length)
    
    if [ "$USER_COUNT" -gt 0 ]; then
        echo "✅ $email"
        echo "   Credits: $(echo $USER_CHECK | jq -r '.[0].credits')"
        echo "   Role: $(echo $USER_CHECK | jq -r '.[0].role')"
    else
        echo "❌ $email not found"
    fi
    echo ""
done

echo "═══════════════════════════════════════════════════════════════════"
echo "ADMIN SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Next step: Run ./deploy/05-build-deploy.sh"
echo ""
