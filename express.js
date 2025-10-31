// Express Application for Duet Controller API
// Node.js 24.10
// Raspberry Pi -> USB -> Duet Mainboard

import 'dotenv/config';
import express from 'express';
import Duet from './duet.js';
import System from './system.js';
import Webcam from './webcam.js';
import { initializeRoutes } from './routes.js';
import { displayBanner, displayRoutes, routes as routeDefinitions } from './ascii-art.js';

const app = express();
const PORT = process.env.PORT || 3000;
const DEV_MODE = process.env.DEV_MODE === 'true';
const SERIAL_PATH = process.env.SERIAL_PATH || '/dev/ttyUSB0';

// CNC Machine Configuration
const config = {
  machine: {
    xDimension: parseFloat(process.env.X_DIMENSION) || 200,
    yDimension: parseFloat(process.env.Y_DIMENSION) || 200
  }
};

// Middleware
app.use(express.json());

// Initialize Duet controller ONCE - this is the persistent connection
const duet = new Duet({
  devMode: DEV_MODE,
  serialPath: SERIAL_PATH,
  xDimension: config.machine.xDimension,
  yDimension: config.machine.yDimension
});

// Initialize System manager
const system = new System({
  devMode: DEV_MODE,
  defaultShutdownMinutes: parseInt(process.env.DEFAULT_SHUTDOWN_MINUTES) || 5
});

// Initialize Webcam controller
const webcam = new Webcam({
  devMode: DEV_MODE,
  device: process.env.WEBCAM_DEVICE || '/dev/video0',
  imageDir: '/var/www/gellyroller/img'
});

// Event listeners for connection monitoring
duet.on('ready', () => {
  console.log('Duet controller ready');
});

duet.on('error', (error) => {
  console.error('Duet error:', error.message);
});

duet.on('close', () => {
  console.warn('Duet connection closed - will attempt to reconnect');
});

duet.on('position', (position) => {
  console.log('Position updated:', position);
});

// Initialize and mount routes - passes the SAME duet instance to all routes
const routes = initializeRoutes(duet, system, webcam);
app.use('/', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Graceful shutdown - ONLY time we close the serial port
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  
  try {
    // Close Duet connection cleanly
    duet.close();   
    
    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't close the serial port on error, just log it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't close the serial port on error, just log it
});

// Initialize and start
const server = app.listen(PORT, () => {
  // Display ASCII art banner
  displayBanner();

  // Display server info
  console.log(`\x1b[1m\x1b[36m🚀 Server Information:\x1b[0m`);
  console.log(`   \x1b[32m●\x1b[0m Running on: \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`   \x1b[32m●\x1b[0m Mode: \x1b[1m${DEV_MODE ? 'DEVELOPMENT (Simulated)' : 'PRODUCTION'}\x1b[0m`);
  console.log(`   \x1b[32m●\x1b[0m Serial Path: \x1b[1m${SERIAL_PATH}\x1b[0m`);
  console.log(`   \x1b[32m●\x1b[0m Duet Status: \x1b[1m${duet.isReady() ? '\x1b[32mReady ✓\x1b[0m' : '\x1b[33mInitializing...\x1b[0m'}\x1b[0m\n`);

  // Display color-coded routes
  displayRoutes(routeDefinitions);
});

export { app, server, duet, system, webcam };