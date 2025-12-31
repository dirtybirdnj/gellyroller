// Express Application for Duet Controller API
// Node.js 24.10
// Raspberry Pi -> USB -> Duet Mainboard

import 'dotenv/config';
import express from 'express';
import Duet from './duet.js';
import System from './system.js';
import Webcam from './webcam.js';
import WSServer from './websocket-server.js';
import JobManager from './job-manager.js';
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

// Serve static HTML files
app.use(express.static('.'));

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

// Create HTTP server first (needed for WebSocket)
const server = app.listen(PORT, () => {
  console.log(`Gellyroller API running on http://localhost:${PORT}`);
  console.log(`Mode: ${DEV_MODE ? 'DEVELOPMENT (Simulated)' : 'PRODUCTION'}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`Serial Path: ${SERIAL_PATH}`);
});

// Initialize WebSocket server (attached to HTTP server)
const wsServer = new WSServer(server, { devMode: DEV_MODE });
wsServer.startHeartbeat();

// Initialize Job Manager (connects duet, parser, and websocket)
const jobManager = new JobManager(duet, wsServer, { devMode: DEV_MODE });

// Position polling - broadcast updates to all WebSocket clients
let lastPosition = { x: null, y: null, z: null };
const POSITION_POLL_INTERVAL = 500; // ms

async function pollPosition() {
  if (!duet.ready) return;

  try {
    const position = await duet.getPosition();

    // Only broadcast if position changed
    if (position.x !== lastPosition.x ||
        position.y !== lastPosition.y ||
        position.z !== lastPosition.z) {
      lastPosition = { ...position };
      wsServer.emitPosition(position);
    }
  } catch (err) {
    // Silently ignore polling errors
  }
}

// Start polling when Duet is ready
duet.on('ready', () => {
  setInterval(pollPosition, POSITION_POLL_INTERVAL);
});

// If already ready (dev mode), start immediately
if (duet.ready) {
  setInterval(pollPosition, POSITION_POLL_INTERVAL);
}

// Initialize and mount routes (with all dependencies)
const routes = initializeRoutes(duet, system, webcam, jobManager);
app.use('/', routes);

// 404 handler (must be after routes)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Log available endpoints
console.log('Endpoints:');
console.log('  Machine: /position, /state, /status, /home, /goto/*, /pause, /cancel');
console.log('  G-code:  /gcode, /execute, /sd/*');
console.log('  Jobs:    /job/upload, /job/list, /job/:id, /job/:id/start|pause|resume|cancel');
console.log('  Webcam:  /webcam/photo, /webcam/config, /webcam/images, /webcam/test');
console.log('  System:  /system/shutdown, /system/restart, /system/uptime');
console.log('  Health:  /health');

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');

  try {
    // Close WebSocket server
    wsServer.close();
    console.log('WebSocket server closed');

    // Close Duet connection
    duet.close();
    console.log('Duet connection closed');

    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
});

export { app, server, duet, system, webcam, wsServer, jobManager };
