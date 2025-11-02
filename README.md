# SkyTrack - Real-Time Global Aircraft Tracking

SkyTrack is an interactive web application that visualizes real-time aircraft tracking data from around the world. Built as a HackTheBurgh 2025 project, it combines a stunning 3D globe interface with detailed 2D map views to explore live air traffic patterns and aircraft positions.

## Overview

The application consists of three main views:
1. **Landing Screen** - Animated welcome screen with 3D globe
2. **Globe View** - Interactive 3D globe where users select a country
3. **Map View 2D** - Detailed 2D map showing real-time aircraft positions for the selected country

The project demonstrates chaos theory concepts by allowing users to adjust a "radar sensitivity" slider, which progressively reveals more aircraft and triggers simulated international conflicts as sensitivity increases.

## Architecture

### Frontend (React + TypeScript + Three.js)

The frontend is built as a single-page React application using:
- **React 18** with TypeScript for type safety
- **Vite** as the build tool and development server
- **React Three Fiber** (@react-three/fiber) for 3D rendering
- **Three.js** for 3D graphics (wrapped by React Three Fiber)
- **shadcn/ui** components built on Radix UI
- **Tailwind CSS** for styling
- **TanStack Query** for data fetching and caching
- **React Router** for routing

#### Key Components

##### `LandingScreen.tsx`
The initial welcome screen featuring:
- Animated starfield background using React Three Fiber's `Stars` component
- 3D spinning globe in the background with country borders
- CRT scanlines and radar sweep effects
- Floating particles animation
- Information cards about chaos theory and simulation concepts
- Smooth transitions to the globe selection view

##### `Globe.tsx`
The interactive 3D globe for country selection:
- Renders a 3D Earth sphere with country borders as 3D lines
- Displays major capital cities as glowing markers
- Interactive orbit controls (drag to rotate, scroll to zoom)
- Hover detection for country highlighting
- Click detection to select countries
- Random country selection button
- Conversion from TopoJSON data (from `/public/countries.json`) to GeoJSON
- Real-time rotation animation
- Starfield background matching the landing screen aesthetic

**Key Features:**
- Uses spherical coordinate math to convert lat/lng to 3D vectors
- Creates mesh geometries for country regions to enable click detection
- Calculates country centroids to place selection markers
- Handles both Polygon and MultiPolygon geometries from GeoJSON

##### `MapView2D.tsx`
The main game/simulation view showing aircraft tracking:
- 2D SVG-based map rendering of the selected country
- Real-time aircraft position visualization
- **Radar Sensitivity Slider** - Core interaction that controls aircraft visibility
- Conflict simulation system that triggers as sensitivity increases
- Aircraft information panels on selection
- Threat dashboard with statistics
- Timer system (10-minute countdown)
- Conflict history tracking with visualizations
- Position trail tracking for sensitivity slider changes

**Key Mechanics:**
1. **Aircraft Filtering**: Based on sensitivity slider value (0.02-0.03 range)
   - Below 0.02: No aircraft visible
   - 0.02-0.03: Gradual reveal (scaled from 0% to 100% of aircraft)
   - Above 0.03: All aircraft visible (chaos mode)
2. **Conflict Generation**: Random conflicts between countries trigger as sensitivity increases
3. **Chain Reactions**: Conflicts can cascade into other countries
4. **Visual Feedback**: Explosion effects, error messages, threat indicators

##### `Index.tsx`
Main page component that orchestrates the application flow:
- Manages state transitions between landing → globe → map views
- Handles country selection callbacks
- Displays help dialog
- Manages game over/restart logic

### Backend (Express + TypeScript)

The backend is an Express.js REST API server that acts as a proxy to the OpenSky Network API.

#### Server Architecture

```
server/src/
├── index.ts              # Express app setup and server initialization
├── config/config.ts      # Configuration management (env vars, defaults)
├── routes/aircraft.ts    # API route handlers for /api/aircraft
├── services/
│   └── opensky-client.ts # OpenSky API client with OAuth2/Basic auth
├── middleware/
│   └── cache.ts          # In-memory caching system
├── types/
│   └── aircraft.ts       # TypeScript type definitions
└── utils/
    └── geospatial.ts     # Distance, bearing, bounding box calculations
```

#### API Endpoints

##### `GET /api/aircraft`
Fetches live aircraft state data from OpenSky Network.

**Query Parameters** (optional bounding box filter):
- `lamin` - Minimum latitude
- `lamax` - Maximum latitude  
- `lomin` - Minimum longitude
- `lomax` - Maximum longitude

**Response Format:**
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

##### `GET /api/aircraft/health`
Health check endpoint.

#### Key Backend Features

1. **OpenSky API Integration**
   - Supports both OAuth2 (preferred) and Basic Auth authentication
   - Handles bounding box filtering for regional aircraft queries
   - 10-second timeout on API requests
   - Comprehensive error handling

2. **Caching System**
   - In-memory cache to reduce API calls
   - Configurable TTL (default: 10 seconds)
   - Cache keys based on bounding box parameters
   - Automatic cleanup of expired entries
   - Max 100 entries with FIFO eviction

3. **Geospatial Utilities**
   - Great-circle distance calculations
   - Bearing calculations
   - Bounding box operations

### Data Flow

1. **Country Selection Flow:**
   ```
   User clicks country on Globe → Index.tsx receives callback → 
   Calculates country bounding box → Transitions to MapView2D
   ```

2. **Aircraft Data Fetching:**
   ```
   MapView2D mounts with selectedCountry → 
   Loads countries.json → Finds selected country geometry →
   calculateBoundingBox() → buildAircraftApiUrl() →
   Fetch /api/aircraft?lamin=...&lamax=... →
   Backend checks cache → If miss, fetches from OpenSky API →
   Returns aircraft array → Frontend filters by sensitivity →
   Renders aircraft on map
   ```

3. **Real-time Updates:**
   - Aircraft data is fetched once when country is selected
   - Sensitivity slider controls which aircraft are visible
   - No automatic refresh (data is static per session)

### Utilities

#### `src/lib/country-bounds.ts`
Helper functions for working with country geometries:
- `calculateBoundingBox()` - Converts GeoJSON geometry to lat/lng bounding box with 1-degree buffer
- `buildAircraftApiUrl()` - Constructs API URL with bounding box query parameters

### Static Assets

- `/public/countries.json` - TopoJSON data for world countries
- `/public/aircraft-positions.json` - Fallback/example aircraft data
- `/public/war-simulation.json` - Simulation configuration data

## Technologies Used

### Frontend Dependencies
- **React 18.3.1** - UI framework
- **TypeScript 5.8.3** - Type safety
- **Vite 5.4.19** - Build tool and dev server
- **@react-three/fiber 8.18.0** - React renderer for Three.js
- **@react-three/drei 9.122.0** - Useful helpers for React Three Fiber
- **three 0.160.1** - 3D graphics library
- **topojson-client 3.1.0** - Convert TopoJSON to GeoJSON
- **react-router-dom 6.30.1** - Client-side routing
- **@tanstack/react-query 5.83.0** - Data fetching and caching
- **tailwindcss 3.4.17** - Utility-first CSS
- **shadcn/ui** components - UI component library
- **lucide-react** - Icon library
- **sonner** - Toast notifications

### Backend Dependencies
- **express 4.21.1** - Web framework
- **cors 2.8.5** - CORS middleware
- **typescript 5.8.3** - Type safety
- **tsx 4.19.2** - TypeScript execution (for running server)

## Setup and Installation

### Prerequisites
- Node.js 18+ and npm
- (Optional) OpenSky Network account credentials for higher rate limits

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd globe-of-war
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Configure OpenSky API credentials:
```bash
cp credentials.json.example credentials.json
# Edit credentials.json with your OpenSky username/password or clientId/clientSecret
```

Alternatively, set environment variables:
```bash
export OPENSKY_USERNAME=your_username
export OPENSKY_PASSWORD=your_password

# Or for OAuth2:
export OPENSKY_CLIENT_ID=your_client_id
export OPENSKY_CLIENT_SECRET=your_client_secret
```

### Running the Application

You need to run both the frontend and backend servers:

**Terminal 1 - Frontend (Vite dev server):**
```bash
npm run dev
```
Frontend runs on `http://localhost:8080`

**Terminal 2 - Backend (Express API server):**
```bash
npm run dev:server
```
Backend runs on `http://localhost:3001`

The Vite dev server is configured to proxy `/api/*` requests to the backend server automatically.

### Production Build

Build the frontend:
```bash
npm run build
```

The built files will be in the `dist/` directory.

Run the backend in production mode:
```bash
npm run server
```

## Configuration

### Backend Configuration

Environment variables (all optional):
- `PORT` - Server port (default: 3001)
- `HOST` - Server host (default: localhost)
- `CACHE_ENABLED` - Enable caching (default: true)
- `CACHE_TTL` - Cache time-to-live in seconds (default: 10)
- `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` - Basic Auth credentials
- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` - OAuth2 credentials

See `server/src/config/config.ts` for full configuration options.

### Frontend Configuration

Vite proxy configuration is in `vite.config.ts`:
- Frontend dev server: port 8080
- API proxy target: `http://localhost:3001`

## How It Works - Technical Deep Dive

### 3D Globe Rendering

The globe uses spherical coordinate mathematics to convert geographic coordinates (latitude/longitude) to 3D Cartesian coordinates:

```typescript
function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);  // Polar angle
  const theta = (lng + 180) * (Math.PI / 180); // Azimuthal angle
  
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}
```

Country borders are rendered as 3D `Line` components, and invisible mesh geometries are used for click detection.

### Aircraft Visualization

In MapView2D, aircraft are positioned on an SVG map:
- Country boundaries are rendered as SVG paths from GeoJSON coordinates
- Aircraft positions are calculated relative to the SVG viewBox
- Aircraft icons rotate based on heading (if available)
- Color coding: cyan for aircraft, red for conflicts

### Chaos Theory Simulation

The "radar sensitivity" slider represents the core chaos theory concept:
- **Low sensitivity (0.00-0.02)**: World appears peaceful, no aircraft visible
- **Medium sensitivity (0.02-0.03)**: Gradual reveal of aircraft, initial conflicts
- **High sensitivity (0.03+)**: Complete visibility, chaos mode with cascading conflicts

As sensitivity increases:
1. More aircraft become visible
2. Random conflicts are generated between countries
3. Conflicts can trigger chain reactions
4. Visual feedback (explosions, error messages) intensifies
5. Threat dashboard shows escalating statistics

## Project Structure

```
globe-of-war/
├── src/                          # Frontend source code
│   ├── components/
│   │   ├── Globe.tsx            # 3D globe component
│   │   ├── LandingScreen.tsx    # Landing page
│   │   ├── MapView2D.tsx        # Main 2D map view
│   │   └── ui/                  # shadcn/ui components
│   ├── pages/
│   │   ├── Index.tsx            # Main page router
│   │   └── NotFound.tsx         # 404 page
│   ├── lib/
│   │   ├── country-bounds.ts    # Bounding box utilities
│   │   └── utils.ts             # General utilities
│   ├── hooks/                   # Custom React hooks
│   ├── App.tsx                  # Root component
│   └── main.tsx                 # Entry point
├── server/                      # Backend source code
│   ├── src/
│   │   ├── index.ts             # Server entry point
│   │   ├── config/              # Configuration
│   │   ├── routes/              # API routes
│   │   ├── services/            # Business logic
│   │   ├── middleware/          # Express middleware
│   │   ├── types/               # TypeScript types
│   │   └── utils/               # Utility functions
│   └── README.md                # Backend documentation
├── public/                      # Static assets
│   ├── countries.json           # TopoJSON country data
│   └── aircraft-positions.json  # Example aircraft data
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite configuration
└── tailwind.config.ts          # Tailwind CSS configuration
```

## Development Notes

- The application uses React Three Fiber for 3D rendering, which provides a React-friendly wrapper around Three.js
- Country data is in TopoJSON format for efficient storage and must be converted to GeoJSON for rendering
- The OpenSky API has rate limits: ~10 requests/second for unauthenticated users, higher limits with authentication
- Aircraft data is cached for 10 seconds to reduce API calls
- The MapView2D component is quite large (2600+ lines) and handles all simulation logic

## Future Enhancements

Potential improvements:
- Real-time aircraft position updates (WebSocket integration)
- Historical flight path visualization
- More detailed aircraft information panels
- Export conflict data/history
- Multiple country selection and comparison
- Performance optimizations for rendering thousands of aircraft

## License

Created for HackTheBurgh 2025 by WLDN x Builder's Brew

## Acknowledgments

- **OpenSky Network** - Provides the real-time aircraft tracking data
- **React Three Fiber** - Makes 3D rendering in React accessible
- **shadcn/ui** - Beautiful, accessible UI components
- **TopoJSON** - Efficient geographic data format
