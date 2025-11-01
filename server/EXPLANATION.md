# Comprehensive Explanation: OpenSky API Integration

## How the System Works - Step by Step

### 1. Request Flow Overview

```
Frontend/Client Request
    ↓
Express Server (index.ts)
    ↓
Route Handler (routes/aircraft.ts)
    ↓
Cache Check (middleware/cache.ts)
    ↓
API Client (services/opensky-client.ts)
    ↓
OpenSky Network API (external)
    ↓
Response Parsing & Transformation
    ↓
Cache Storage (if cache miss)
    ↓
JSON Response to Client
```

---

## 2. Detailed Component Breakdown

### A. Express Server (`src/index.ts`)

**Purpose**: Main entry point that initializes and configures the Express web server.

**What it does**:
1. Loads configuration from environment variables
2. Initializes Express app with middleware:
   - **CORS**: Allows frontend to make cross-origin requests
   - **JSON Parser**: Parses JSON request bodies
   - **URL Encoder**: Parses URL-encoded request bodies
3. Sets up routes:
   - `GET /` - API information endpoint
   - `GET /api/aircraft` - Main aircraft data endpoint
   - `GET /api/aircraft/health` - Health check
4. Handles errors and graceful shutdown

**Key Code**:
```typescript
// Server listens on configured port
app.listen(config.server.port, config.server.host, () => {
  // Server started successfully
});
```

---

### B. Route Handler (`src/routes/aircraft.ts`)

**Purpose**: Handles HTTP requests to the `/api/aircraft` endpoint.

**What it does**:

1. **Query Parameter Parsing**:
   - Extracts optional bounding box parameters (`lamin`, `lamax`, `lomin`, `lomax`)
   - Validates coordinates are within valid ranges
   - Creates a `BoundingBox` object if all parameters provided

2. **Cache Management**:
   - Generates cache key based on query parameters
   - Checks cache for existing data
   - If cache hit: Returns cached data immediately
   - If cache miss: Fetches from OpenSky API and stores in cache

3. **Response Formatting**:
   - Wraps response in standardized format:
     ```json
     {
       "success": true,
       "count": 1234,
       "data": [...aircraft array...],
       "timestamp": 1234567890123
     }
     ```

4. **Error Handling**:
   - Catches any errors from API client
   - Returns 500 status with error details

**Example Request Flow**:
```
GET /api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2
    ↓
Parse bounding box: { minLatitude: 50, maxLatitude: 60, ... }
    ↓
Check cache key: "aircraft:50,60,-10,2"
    ↓
Cache miss → Call OpenSky API
    ↓
Store in cache (10 second TTL)
    ↓
Return formatted response
```

---

### C. OpenSky API Client (`src/services/opensky-client.ts`)

**Purpose**: Communicates directly with OpenSky Network REST API.

**What it does**:

1. **HTTP Request Construction**:
   - Builds URL: `https://opensky-network.org/api/states/all`
   - Adds query parameters for bounding box if provided
   - Adds Basic Auth headers if credentials configured

2. **API Request**:
   - Sends GET request with 10-second timeout
   - Uses native `fetch()` API (Node.js 18+)

3. **Response Validation**:
   - Checks HTTP status code
   - Validates JSON response structure
   - Ensures `states` array exists

4. **Data Transformation**:
   - OpenSky returns arrays of 17 elements per aircraft
   - Transforms raw arrays into typed `Aircraft` objects
   - Filters out invalid entries

**OpenSky Response Format** (Raw):
```json
{
  "time": 1234567890,
  "states": [
    [
      "abc123",           // [0] icao24
      "UAL123",           // [1] callsign
      "United States",    // [2] origin_country
      1234567890,         // [3] time_position
      1234567890,         // [4] last_contact
      -0.1278,            // [5] longitude
      51.5074,            // [6] latitude
      10000,              // [7] baro_altitude (meters)
      false,              // [8] on_ground
      250.5,              // [9] velocity (m/s)
      45.2,               // [10] true_track (degrees)
      5.0,                // [11] vertical_rate (m/s)
      [1, 2],             // [12] sensors
      10100,              // [13] geo_altitude (meters)
      "1234",             // [14] squawk
      false,              // [15] spi
      0                   // [16] position_source
    ],
    // ... more aircraft
  ]
}
```

**Transformed Aircraft Object**:
```typescript
{
  icao24: "abc123",
  callsign: "UAL123",
  originCountry: "United States",
  latitude: 51.5074,
  longitude: -0.1278,
  barometricAltitude: 10000,
  geometricAltitude: 10100,
  velocity: 250.5,
  heading: 45.2,
  verticalRate: 5.0,
  onGround: false,
  timePosition: 1234567890,
  lastContact: 1234567890,
  squawk: "1234",
  spi: false,
  positionSource: 0
}
```

---

### D. Caching System (`src/middleware/cache.ts`)

**Purpose**: Reduces API calls and improves response times.

**How it works**:

1. **In-Memory Storage**:
   - Uses JavaScript `Map` to store cache entries
   - Each entry contains: `{ data, timestamp, ttl }`

2. **Cache Key Generation**:
   - Based on query parameters
   - Example: `"aircraft:50,60,-10,2"` for UK region
   - Example: `"aircraft:all"` for no filters

3. **Time-Based Expiration (TTL)**:
   - Default: 10 seconds (configurable)
   - Entries expire after TTL period
   - Automatic cleanup runs every 60 seconds

4. **Size Management**:
   - Maximum 100 entries (FIFO eviction)
   - Oldest entries removed when limit reached

5. **Cache Flow**:
   ```
   Request → Check cache key
      ↓
   Found? → Check expiration
      ↓
   Valid? → Return cached data
      ↓
   Expired/Missing? → Fetch from API → Store in cache → Return data
   ```

**Benefits**:
- Reduces OpenSky API calls (respects rate limits)
- Faster response times for repeated queries
- Lower bandwidth usage

---

### E. Type System (`src/types/aircraft.ts`)

**Purpose**: Provides type safety and clear data structures.

**Key Types**:

1. **`RawAircraftState`**: 
   - Tuple type matching OpenSky's array format
   - 17 elements with specific positions
   - Each element can be null

2. **`Aircraft`**: 
   - Clean, typed object with named properties
   - Nullable fields where data might be missing
   - Used throughout the application

3. **`BoundingBox`**: 
   - Geographic region definition
   - Used for filtering aircraft by location

4. **`OpenSkyResponse`**: 
   - Structure of API response
   - Includes timestamp and states array

---

### F. Geospatial Utilities (`src/utils/geospatial.ts`)

**Purpose**: Helper functions for geographic calculations.

**Available Functions**:

1. **`calculateDistance(lat1, lon1, lat2, lon2)`**:
   - Uses Haversine formula
   - Returns distance in kilometers
   - Accounts for Earth's curvature

2. **`calculateBearing(lat1, lon1, lat2, lon2)`**:
   - Calculates initial direction
   - Returns degrees (0-360, 0 = North)

3. **`isWithinBoundingBox(lat, lon, bbox)`**:
   - Checks if point is inside rectangle
   - Used for filtering

4. **`distanceToBoundingBox(lat, lon, bbox)`**:
   - Distance from point to nearest edge
   - Returns 0 if inside

---

## 3. What Information is Returned

### Response Structure

```json
{
  "success": true,
  "count": 1523,
  "data": [
    {
      "icao24": "a0f3b1",
      "callsign": "UAL123",
      "originCountry": "United States",
      "latitude": 51.5074,
      "longitude": -0.1278,
      "barometricAltitude": 10000,
      "geometricAltitude": 10100,
      "velocity": 250.5,
      "heading": 45.2,
      "verticalRate": 5.0,
      "onGround": false,
      "timePosition": 1734567890,
      "lastContact": 1734567890,
      "squawk": "1234",
      "spi": false,
      "positionSource": 0
    }
  ],
  "timestamp": 1734567890123
}
```

### Field Explanations

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| **icao24** | string | Unique aircraft identifier (hex) | `"a0f3b1"` |
| **callsign** | string/null | Flight number/callsign | `"UAL123"` |
| **originCountry** | string/null | Country of registration | `"United States"` |
| **latitude** | number/null | Position latitude (-90 to 90) | `51.5074` |
| **longitude** | number/null | Position longitude (-180 to 180) | `-0.1278` |
| **barometricAltitude** | number/null | Altitude from barometric pressure (meters) | `10000` |
| **geometricAltitude** | number/null | GPS altitude (meters) | `10100` |
| **velocity** | number/null | Ground speed (meters/second) | `250.5` |
| **heading** | number/null | Direction of travel (0-360°, 0=North) | `45.2` |
| **verticalRate** | number/null | Climb/descent rate (m/s, + = up) | `5.0` |
| **onGround** | boolean/null | Whether aircraft is on ground | `false` |
| **timePosition** | number/null | Unix timestamp of position update | `1734567890` |
| **lastContact** | number/null | Unix timestamp of last update | `1734567890` |
| **squawk** | string/null | Transponder code | `"1234"` |
| **spi** | boolean/null | Special purpose indicator | `false` |
| **positionSource** | number/null | Data source (0=ADS-B, 1=ASTERIX, 2=MLAT) | `0` |

### Common Use Cases

1. **Display Aircraft on Map**:
   - Use `latitude` and `longitude` for positioning
   - Use `heading` for aircraft direction/rotation
   - Use `onGround` to filter out ground vehicles

2. **Aircraft Identification**:
   - Use `icao24` as unique key
   - Display `callsign` as label
   - Show `originCountry` for context

3. **Flight Status**:
   - `barometricAltitude` for current altitude
   - `velocity` converted to km/h (multiply by 3.6)
   - `verticalRate` to show climbing/descending

4. **Anomaly Detection**:
   - Compare `velocity` to expected speeds
   - Check `heading` for unexpected directions
   - Monitor `verticalRate` for rapid changes

---

## 4. Example Usage Scenarios

### Scenario 1: Get All Aircraft Worldwide
```bash
GET /api/aircraft
```
Returns all aircraft currently tracked by OpenSky (typically 5,000-15,000 aircraft).

### Scenario 2: Get Aircraft in Specific Region
```bash
GET /api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2
```
Returns only aircraft in UK airspace (latitude 50-60, longitude -10 to 2).

### Scenario 3: Real-Time Tracking
```javascript
// Poll every 10 seconds
setInterval(async () => {
  const response = await fetch('http://localhost:3001/api/aircraft');
  const { data } = await response.json();
  updateAircraftOnMap(data);
}, 10000);
```

---

## 5. Error Handling

### Types of Errors

1. **Network Errors**:
   - OpenSky API unreachable
   - Timeout (>10 seconds)
   - Returns 500 with error message

2. **Invalid Responses**:
   - Malformed JSON
   - Missing required fields
   - Returns 500 with validation error

3. **Invalid Parameters**:
   - Bounding box coordinates out of range
   - Invalid query parameters
   - Returns 400 (if implemented)

### Error Response Format
```json
{
  "success": false,
  "error": "Failed to fetch aircraft data from OpenSky API",
  "message": "Request timeout after 10 seconds",
  "timestamp": 1734567890123
}
```

---

## 6. Performance Considerations

### Caching Impact
- **Without cache**: Every request hits OpenSky API (~1-2 seconds)
- **With cache**: Cached requests return instantly (<10ms)
- **Cache hit rate**: Depends on request patterns (typically 70-90%)

### Rate Limits
- **Unauthenticated**: ~10 requests/second
- **Authenticated**: Higher limits (requires credentials)
- **Caching reduces**: Effective rate by ~90%

### Data Volume
- **Typical response**: 5,000-15,000 aircraft
- **Response size**: ~1-3 MB uncompressed
- **With compression**: ~200-500 KB

---

## 7. Configuration Options

### Environment Variables

```bash
# Server
PORT=3001              # Server port
HOST=localhost         # Server host

# OpenSky API (optional)
OPENSKY_USERNAME=...   # For higher rate limits
OPENSKY_PASSWORD=...   # For higher rate limits

# Cache
CACHE_ENABLED=true     # Enable/disable caching
CACHE_TTL=10          # Cache duration in seconds

# Rate Limiting
RATE_LIMIT_ENABLED=true # Enable rate limiting
```

---

## Summary

This system provides a clean, cached, and well-documented API wrapper around OpenSky Network's aircraft tracking data. It:

1. ✅ Fetches real-time aircraft positions
2. ✅ Transforms raw data into clean, typed objects
3. ✅ Caches responses to improve performance
4. ✅ Supports geographic filtering
5. ✅ Handles errors gracefully
6. ✅ Provides comprehensive documentation

The architecture is modular, testable, and easily extensible for future enhancements like:
- WebSocket support for real-time updates
- Database storage for historical data
- Advanced filtering and search
- Analytics and statistics endpoints

