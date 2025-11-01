/**
 * Express Server Entry Point
 * 
 * This is the main server file that initializes the Express application,
 * sets up middleware, configures routes, and starts the HTTP server.
 */

import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { createAircraftRouter } from './routes/aircraft.js';
import { initializeCache } from './middleware/cache.js';
import { loadConfig } from './config/config.js';

/**
 * Main application setup function
 * 
 * Initializes Express app, middleware, routes, and starts the server.
 */
async function main() {
  // Load configuration
  const config = loadConfig();
  
  // Initialize Express app
  const app: Express = express();
  
  // Initialize cache
  initializeCache(config);
  
  // Middleware
  app.use(cors()); // Enable CORS for frontend access
  app.use(express.json()); // Parse JSON request bodies
  app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
  
  // Request logging middleware
  app.use((req: Request, res: Response, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
  
  // API Routes
  app.use('/api/aircraft', createAircraftRouter(config));
  
  // Root endpoint
  app.get('/', (req: Request, res: Response) => {
    res.json({
      message: 'Globe of War - OpenSky API Integration',
      version: '1.0.0',
      endpoints: {
        aircraft: '/api/aircraft',
        health: '/api/aircraft/health',
      },
      documentation: 'See README.md for API documentation',
    });
  });
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `The requested endpoint ${req.path} was not found.`,
    });
  });
  
  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: any) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  });
  
  // Start server
  const server = app.listen(config.server.port, config.server.host, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         Globe of War - OpenSky API Server                    ║
║                                                              ║
║  Server running at: http://${config.server.host}:${config.server.port}      ║
║  Environment: ${process.env.NODE_ENV || 'development'}                                   ║
║                                                              ║
║  Endpoints:                                                  ║
║  - GET  /                    API information                 ║
║  - GET  /api/aircraft        Fetch all aircraft data         ║
║  - GET  /api/aircraft/health Health check                    ║
║                                                              ║
║  Cache: ${config.cache.enabled ? 'Enabled' : 'Disabled'}                                    ║
║  Rate Limit: ${config.rateLimit.enabled ? 'Enabled' : 'Disabled'}                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

