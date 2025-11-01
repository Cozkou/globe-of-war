# OpenSky API Authentication Guide

## Understanding Rate Limits

### Current Rate Limits

| User Type | Rate Limit | Requests Per Day (approx) |
|-----------|------------|---------------------------|
| **Anonymous** | 1 request every 10 seconds | ~8,640 requests/day |
| **Authenticated** | ~10 requests per second | ~864,000 requests/day |
| **Active Feeder** | Up to 8,000 API credits/day | Varies by query type |

**Key Point**: Authenticated users get approximately **100x more requests** than anonymous users!

---

## Why You're Hitting Rate Limits

With anonymous access:
- **Only 1 request every 10 seconds**
- If multiple users/clients make requests, they share this limit
- If your frontend polls frequently, you'll quickly hit the limit

---

## Solution: Become an Authenticated User

### Step 1: Register for an OpenSky Account

1. Visit the OpenSky Network registration page:
   - **Registration URL**: https://opensky-network.org/user/register
   - Or go to https://opensky-network.org/ and click "Register"

2. Complete the registration form:
   - Provide your email address
   - Choose a username and password
   - Complete any verification steps

3. **Important**: After March 2025, new accounts may require manual API access activation
   - If you don't see API access after registration, contact OpenSky support
   - Support email/contact: Check the OpenSky website for current contact info

### Step 2: Get Your Credentials

OpenSky supports **Basic Authentication** (username/password):

- **Username**: The username you registered with
- **Password**: Your account password

**Note**: Some newer accounts may use OAuth2 (`client_id`/`client_secret`), but Basic Auth still works for most accounts.

### Step 3: Configure Your Server

Your server code **already supports authentication**! You just need to set environment variables.

#### Option A: Using Environment Variables (Recommended)

Create a `.env` file in your project root:

```bash
# OpenSky API Authentication
OPENSKY_USERNAME=your_opensky_username
OPENSKY_PASSWORD=your_opensky_password

# Keep existing config
PORT=3001
HOST=localhost
CACHE_ENABLED=true
CACHE_TTL=15
```

#### Option B: Set Environment Variables Directly

**Linux/Mac:**
```bash
export OPENSKY_USERNAME=your_opensky_username
export OPENSKY_PASSWORD=your_opensky_password
npm run server
```

**Windows (PowerShell):**
```powershell
$env:OPENSKY_USERNAME="your_opensky_username"
$env:OPENSKY_PASSWORD="your_opensky_password"
npm run server
```

**Windows (CMD):**
```cmd
set OPENSKY_USERNAME=your_opensky_username
set OPENSKY_PASSWORD=your_opensky_password
npm run server
```

### Step 4: Verify Authentication is Working

1. Start your server:
   ```bash
   npm run server
   ```

2. Test the endpoint:
   ```bash
   curl http://localhost:3001/api/aircraft
   ```

3. Check the server logs - you should see successful requests without rate limit errors

4. Test multiple rapid requests:
   ```bash
   # This should work without rate limit errors (10 requests per second)
   for i in {1..5}; do curl -s http://localhost:3001/api/aircraft | head -1; sleep 0.1; done
   ```

---

## How Your Code Works

### Current Implementation

Your server already handles authentication in `server/src/services/opensky-client.ts`:

```typescript
// Line 59-63: If credentials are provided, add Basic Auth header
if (options.username && options.password) {
  const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
  headers['Authorization'] = `Basic ${credentials}`;
}
```

### What Happens:

1. **With Credentials**: Your server sends authenticated requests to OpenSky
   - Uses Basic Authentication header
   - Gets ~10 requests/second limit
   - No more rate limit errors!

2. **Without Credentials**: Server makes anonymous requests
   - Only 1 request every 10 seconds
   - Hits rate limits quickly

---

## Additional Benefits of Authentication

Beyond higher rate limits, authenticated users get:

1. **More Data Access**: 
   - Access to historical data (up to 1 hour in the past)
   - 5-second time resolution for historical queries

2. **Better Reliability**:
   - Higher priority requests
   - Less likely to be throttled

3. **Support**:
   - Access to OpenSky support channels
   - Can request custom limits if needed

---

## Troubleshooting

### Problem: Still Getting Rate Limit Errors

**Solutions:**

1. **Verify credentials are set**:
   ```bash
   echo $OPENSKY_USERNAME  # Should show your username
   echo $OPENSKY_PASSWORD  # Should show your password
   ```

2. **Check server logs** - Look for authentication errors

3. **Test credentials directly**:
   ```bash
   curl -u "your_username:your_password" \
     "https://opensky-network.org/api/states/all"
   ```

4. **Account may need activation** - Contact OpenSky support if new account doesn't work

### Problem: Account Created But No API Access

- This is common for accounts created after March 2025
- **Solution**: Contact OpenSky support to request API access activation
- Provide your username and explain your use case

### Problem: Credentials Not Working

1. Verify username/password are correct
2. Check for typos or extra spaces
3. Try logging into the OpenSky website with the same credentials
4. Some accounts may need to use OAuth2 instead (see below)

---

## Future: OAuth2 Support (Optional)

OpenSky is transitioning to OAuth2 for new accounts. If Basic Auth doesn't work, you may need OAuth2.

**Current Status**: Your code supports Basic Auth. If OpenSky requires OAuth2 for your account, we can add that support.

**OAuth2 Flow**:
1. Get `client_id` and `client_secret` from OpenSky account settings
2. Exchange for access token
3. Use token in Authorization header

---

## Quick Start Checklist

- [ ] Register at https://opensky-network.org/user/register
- [ ] Verify account email
- [ ] Note your username and password
- [ ] Create `.env` file with credentials
- [ ] Restart server with `npm run server`
- [ ] Test endpoint - should work without rate limits!
- [ ] If issues, contact OpenSky support for API access activation

---

## Security Notes

⚠️ **Important Security Reminders**:

1. **Never commit `.env` files** to git - add to `.gitignore`
2. **Don't share credentials** publicly
3. **Use environment variables** - never hardcode credentials
4. **Rotate passwords** periodically if needed

Your `.env` file should already be in `.gitignore`, but verify:
```bash
cat .gitignore | grep .env
```

---

## Summary

**To fix rate limit issues:**

1. ✅ Register at OpenSky (5 minutes)
2. ✅ Set `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` environment variables
3. ✅ Restart your server
4. ✅ Enjoy 100x more requests (10/sec vs 1 per 10 sec)!

Your code is already ready - just add the credentials! 🚀

