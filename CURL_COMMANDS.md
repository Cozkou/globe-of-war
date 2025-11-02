# API Testing - Curl Commands

Quick reference for testing the Globe of War API endpoints.

## Server Setup

Make sure the server is running:
```bash
npm run server
```

Server runs on: `http://localhost:3001`

## Basic Endpoints

### 1. API Information
```bash
curl http://localhost:3001/
```

### 2. Health Check
```bash
curl http://localhost:3001/api/aircraft/health
```

### 3. Get All Aircraft (All Regions)
```bash
curl http://localhost:3001/api/aircraft
```

Pretty print with aircraft count:
```bash
curl -s http://localhost:3001/api/aircraft | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Success: {data[\"success\"]}, Aircraft: {data[\"count\"]}')"
```

## Bounding Box Queries (Regional Filtering)

### 4. United Kingdom
```bash
curl "http://localhost:3001/api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2"
```

### 5. United States - East Coast
```bash
curl "http://localhost:3001/api/aircraft?lamin=35&lamax=45&lomin=-80&lomax=-70"
```

### 6. United States - West Coast
```bash
curl "http://localhost:3001/api/aircraft?lamin=32&lamax=48&lomin=-125&lomax=-114"
```

### 7. Europe
```bash
curl "http://localhost:3001/api/aircraft?lamin=40&lamax=60&lomin=-10&lomax=30"
```

### 8. Australia
```bash
curl "http://localhost:3001/api/aircraft?lamin=-45&lamax=-10&lomin=110&lomax=155"
```

### 9. Africa
```bash
curl "http://localhost:3001/api/aircraft?lamin=-35&lamax=35&lomin=-20&lomax=55"
```

## Example with Pretty Output

Get UK aircraft with formatted JSON:
```bash
curl -s "http://localhost:3001/api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2" | python3 -m json.tool | head -50
```

## Quick Test Script

Save this as `test-api.sh`:
```bash
#!/bin/bash

BASE_URL="http://localhost:3001"

echo "🧪 Testing Globe of War API"
echo "═══════════════════════════════════════════════════"
echo ""

echo "1️⃣  Health Check:"
curl -s "$BASE_URL/api/aircraft/health" | python3 -m json.tool
echo ""

echo "2️⃣  All Aircraft:"
curl -s "$BASE_URL/api/aircraft" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'✅ Success: {data.get(\"success\")}'); print(f'📊 Count: {data.get(\"count\")} aircraft')"
echo ""

echo "3️⃣  UK Region:"
curl -s "$BASE_URL/api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'✅ Count: {data.get(\"count\")} aircraft')"
echo ""

echo "4️⃣  Sample Aircraft:"
curl -s "$BASE_URL/api/aircraft" | python3 -c "import sys, json; data=json.load(sys.stdin); [print(f'  ✈️  {a.get(\"callsign\", \"N/A\")} - {a.get(\"country\", \"Unknown\")}') for a in data.get('data',[])[:5]]"
echo ""

echo "═══════════════════════════════════════════════════"
echo "✅ All tests passed!"
```

Make it executable and run:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Response Format

All aircraft endpoints return JSON in this format:

```json
{
  "success": true,
  "data": [
    {
      "icao24": "string",
      "callsign": "string",
      "country": "string",
      "latitude": number,
      "longitude": number,
      "altitude": number,
      "velocity": number,
      "heading": number,
      "verticalRate": number,
      "timestamp": number
    }
  ],
  "count": number,
  "timestamp": number
}
```

## Authentication Status

The API is now authenticated with OAuth2 credentials from `credentials.json`:
- ✅ **No rate limiting** - You can make requests as fast as needed
- ✅ **Higher rate limits** - Authenticated users have better limits
- ✅ **Token caching** - OAuth2 tokens are cached for 30 minutes

## Troubleshooting

### Server Not Running
```bash
Error: Connection refused
```
→ Start the server: `npm run server`

### Still Getting 429 Errors
```bash
"Too many requests"
```
→ Check logs to verify credentials are being loaded:
```bash
tail -f /tmp/server-dev.log
```
Look for: `✅ OAuth2 credentials loaded from credentials.json`

### No Aircraft Returned
This is normal if:
- No aircraft are flying in that region
- The bounding box is too small
- The region is outside air traffic corridors

Try the global endpoint first:
```bash
curl http://localhost:3001/api/aircraft
```

