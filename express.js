// Express Application for Duet Controller API
// Node.js 24.10
// Raspberry Pi -> USB -> Duet Mainboard

import 'dotenv/config';
import express from 'express';
import Duet from './duet.js';
import System from './system.js';
import { initializeRoutes } from './routes.js';

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
const routes = initializeRoutes(duet, system);
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
  console.log(`Duet Controller API running on http://localhost:${PORT}`);
  console.log(`Mode: ${DEV_MODE ? 'DEVELOPMENT (Simulated)' : 'PRODUCTION'}`);
  console.log(`Serial Path: ${SERIAL_PATH}`);
  console.log(`Duet Status: ${duet.isReady() ? 'Ready' : 'Initializing...'}`);
  console.log('Available endpoints:');
  console.log('  GET  /position - Get current position');
  console.log('  GET  /state - Get full Duet state');
  console.log('  GET  /status - Get status summary');
  console.log('  GET  /config - Get machine configuration');
  console.log('  PUT  /config - Update machine configuration');
  console.log('  GET  /sd/files - List SD card files');
  console.log('  GET  /sd/info - SD card information');
  console.log('  POST /sd/upload - Upload file to SD card');
  console.log('  POST /execute - Execute G-code file');
  console.log('  POST /pause - Pause operation');
  console.log('  POST /cancel - Cancel operation');
  console.log('  POST /emergency-stop - Emergency stop');
  console.log('  POST /home - Home all axes');
  console.log('  POST /goto/fast - Rapid move');
  console.log('  POST /goto/slow - Controlled move');
  console.log('  POST /gpio/send - Set GPIO pin');
  console.log('  GET  /gpio/read - Read GPIO pin');
  console.log('  POST /gcode - Send raw G-code');
  console.log('  POST /system/shutdown - Schedule system shutdown');
  console.log('  POST /system/shutdown/cancel - Cancel scheduled shutdown');
  console.log('  POST /system/restart - Restart Raspberry Pi');
  console.log('  GET  /system/uptime - Get system uptime');
});

export { app, server, duet, system };