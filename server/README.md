# OpenSky API Integration Server

This is the backend server for the Globe of War application, providing REST API endpoints to fetch live aircraft tracking data from the OpenSky Network.

## Overview

The server integrates with the [OpenSky Network REST API](https://openskynetwork.github.io/opensky-api/) to provide real-time aircraft state information. It includes:

- **API Client Module**: Handles all interactions with OpenSky API
- **Caching System**: Reduces API calls and improves response times
- **Error Handling**: Robust error handling and validation
- **Type Safety**: Full TypeScript support with typed interfaces
- **Geospatial Utilities**: Helper functions for distance and proximity calculations

## Architecture

```
server/
├── src/
│   ├── config/          # Configuration management
│   ├── middleware/      # Express middleware (caching, etc.)
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic (OpenSky client)
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions (geospatial calculations)
│   └── index.ts         # Server entry point
```

## Installation

Install dependencies from the project root:

```bash
npm install
```

## Configuration

Configuration is managed through environment variables. Create a `.env` file in the project root (optional):

```env
# Server Configuration
PORT=3001
HOST=localhost

# OpenSky API (optional - for higher rate limits)
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password

# Cache Configuration
CACHE_ENABLED=true
CACHE_TTL=10  # Cache time-to-live in seconds

# Rate Limiting
RATE_LIMIT_ENABLED=true
```

### Default Values

- **PORT**: `3001`
- **HOST**: `localhost`
- **CACHE_ENABLED**: `true`
- **CACHE_TTL**: `10` seconds
- **OpenSky Credentials**: Optional (unauthenticated requests have lower rate limits)

## Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev:server
```

### Production Mode

```bash
npm run server
```

The server will start on `http://localhost:3001` (or your configured host/port).

## API Endpoints

### GET `/api/aircraft`

Fetches live aircraft state data from OpenSky Network.

**Query Parameters** (all optional):
- `lamin` - Minimum latitude for bounding box filter
- `lamax` - Maximum latitude for bounding box filter
- `lomin` - Minimum longitude for bounding box filter
- `lomax` - Maximum longitude for bounding box filter

**Example Requests**:

```bash
# Get all aircraft
curl http://localhost:3001/api/aircraft

# Get aircraft within UK airspace
curl "http://localhost:3001/api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2"
```

**Response Format**:

```json
{
  "success": true,
  "count": 1234,
  "data": [
    {
      "icao24": "abc123",
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
      "timePosition": 1234567890,
      "lastContact": 1234567890,
      "squawk": "1234",
      "spi": false,
      "positionSource": 0
    }
  ],
  "timestamp": 1234567890123
}
```

### GET `/api/aircraft/health`

Health check endpoint.

**Response**:

```json
{
  "status": "healthy",
  "service": "aircraft-api",
  "timestamp": 1234567890123
}
```

## Aircraft Data Fields

Each aircraft object contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `icao24` | string | Unique ICAO 24-bit address (hex) |
| `callsign` | string \| null | Aircraft callsign (e.g., "UAL123") |
| `originCountry` | string \| null | Country of origin (ISO code) |
| `latitude` | number \| null | Latitude in decimal degrees (-90 to 90) |
| `longitude` | number \| null | Longitude in decimal degrees (-180 to 180) |
| `barometricAltitude` | number \| null | Barometric altitude in meters |
| `geometricAltitude` | number \| null | Geometric altitude in meters |
| `velocity` | number \| null | Velocity over ground (m/s) |
| `heading` | number \| null | True track in degrees (0-360) |
| `verticalRate` | number \| null | Vertical rate (m/s, positive = climbing) |
| `onGround` | boolean \| null | Whether aircraft is on ground |
| `timePosition` | number \| null | Unix timestamp of last position update |
| `lastContact` | number \| null | Unix timestamp of last contact |
| `squawk` | string \| null | Transponder squawk code |
| `spi` | boolean \| null | Special purpose indicator |
| `positionSource` | number \| null | Position source (0=ADS-B, 1=ASTERIX, 2=MLAT) |

## Caching

The server implements an in-memory cache to reduce API calls to OpenSky Network:

- **Enabled by default** (configurable via `CACHE_ENABLED`)
- **Default TTL**: 10 seconds (configurable via `CACHE_TTL`)
- **Max Size**: 100 entries (FIFO eviction when full)
- Automatic cleanup of expired entries

Cache keys are based on the request parameters (bounding box), so different queries are cached separately.

## Error Handling

The server handles errors gracefully:

- **Network Errors**: Returns 500 with error message
- **Timeout Errors**: 10-second timeout on OpenSky API requests
- **Invalid Responses**: Validates API response structure
- **Invalid Parameters**: Validates bounding box parameters

All errors are logged to the console and returned as JSON responses.

## Geospatial Utilities

The server includes utility functions for geospatial calculations:

- `calculateDistance()` - Great-circle distance between two points
- `calculateBearing()` - Initial bearing from one point to another
- `isWithinBoundingBox()` - Check if point is within bounding box
- `distanceToBoundingBox()` - Distance from point to nearest edge of bounding box

See `src/utils/geospatial.ts` for implementation details.

## Rate Limits

OpenSky Network has rate limits:

- **Unauthenticated**: ~10 requests per second
- **Authenticated**: Higher limits (requires username/password)

The server includes rate limiting configuration (currently a placeholder for future implementation).

## Development

### Project Structure

- `src/types/aircraft.ts` - TypeScript type definitions
- `src/services/opensky-client.ts` - OpenSky API client
- `src/routes/aircraft.ts` - Express route handlers
- `src/middleware/cache.ts` - Caching middleware
- `src/config/config.ts` - Configuration management
- `src/utils/geospatial.ts` - Geospatial utility functions

### Adding New Features

1. **New Endpoint**: Add route handler in `src/routes/`
2. **New Service**: Add business logic in `src/services/`
3. **New Types**: Add type definitions in `src/types/`
4. **New Utilities**: Add utility functions in `src/utils/`

## License

This project is part of the Globe of War application.

