// API Routes for Duet Controller

import express from 'express';

const router = express.Router();

// Routes will be initialized with duet and system instances
let duet;
let system;
let webcam;

export function initializeRoutes(duetInstance, systemInstance, webcamInstance) {
  duet = duetInstance;
  system = systemInstance;
  webcam = webcamInstance;
  return router;
}

// Get current position
router.get('/position', async (req, res) => {
  try {
    const position = await duet.getPosition();
    res.json({ success: true, data: position });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get list of SD files
router.get('/sd/files', async (req, res) => {
  try {
    const files = await duet.listSDFiles();
    res.json({ success: true, data: files.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Report SD card info
router.get('/sd/info', async (req, res) => {
  try {
    const info = await duet.getSDInfo();
    res.json({ success: true, data: info.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Execute G-code file from SD card
router.post('/execute', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Filename required' });
    }
    const response = await duet.executeFile(filename);
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload file to SD card
router.post('/sd/upload', async (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ success: false, error: 'Filename and content required' });
    }
    const response = await duet.uploadFile(filename, content);
    res.json({ success: true, data: response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pause current operation
router.post('/pause', async (req, res) => {
  try {
    const response = await duet.pause();
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel/end current operation
router.post('/cancel', async (req, res) => {
  try {
    const response = await duet.stop();
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Emergency stop
router.post('/emergency-stop', async (req, res) => {
  try {
    const response = await duet.emergencyStop();
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Home all axes (or specific axes)
router.post('/home', async (req, res) => {
  try {
    const { axes } = req.body;
    const response = await duet.home(axes || '');
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Go to location fast (G0)
router.post('/goto/fast', async (req, res) => {
  try {
    const { x, y, z } = req.body;
    const response = await duet.moveRapid({ x, y, z });
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Go to location slow (G1)
router.post('/goto/slow', async (req, res) => {
  try {
    const { x, y, z, f } = req.body;
    const response = await duet.moveLinear({ x, y, z }, f);
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send GPIO command
router.post('/gpio/send', async (req, res) => {
  try {
    const { pin, value } = req.body;
    if (pin === undefined || value === undefined) {
      return res.status(400).json({ success: false, error: 'Pin and value required' });
    }
    const response = await duet.setGPIO(pin, value);
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Read GPIO
router.get('/gpio/read', async (req, res) => {
  try {
    const { pin } = req.query;
    if (pin === undefined) {
      return res.status(400).json({ success: false, error: 'Pin parameter required' });
    }
    const response = await duet.readGPIO(pin);
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Duet state
router.get('/state', (req, res) => {
  try {
    const state = duet.getState();
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get status
router.get('/status', (req, res) => {
  try {
    const state = duet.getState();
    res.json({ 
      success: true, 
      data: {
        status: state.status,
        ready: duet.isReady(),
        position: state.position,
        lastUpdate: state.lastUpdate
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get machine configuration
router.get('/config', (req, res) => {
  try {
    const config = duet.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update machine configuration (runtime)
router.put('/config', (req, res) => {
  try {
    const { xDimension, yDimension } = req.body;
    duet.updateConfig({ xDimension, yDimension });
    const config = duet.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send raw G-code
router.post('/gcode', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ success: false, error: 'Command required' });
    }
    const response = await duet.sendGCode(command);
    res.json({ success: true, data: response.trim() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    duetReady: duet.isReady(),
    devMode: process.env.DEV_MODE === 'true',
    timestamp: new Date().toISOString() 
  });
});

// System Management Routes

// Schedule system shutdown
router.post('/system/shutdown', async (req, res) => {
  try {
    const { minutes } = req.body;
    const result = await system.shutdown(minutes);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel scheduled shutdown
router.post('/system/shutdown/cancel', async (req, res) => {
  try {
    const result = await system.cancelShutdown();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restart system
router.post('/system/restart', async (req, res) => {
  try {
    const result = await system.restart();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get system uptime
router.get('/system/uptime', async (req, res) => {
  try {
    const result = await system.getUptime();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webcam Routes

// Capture photo
router.post('/webcam/photo', async (req, res) => {
  try {
    const { filename } = req.body;
    const result = await webcam.capturePhoto({ filename });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get webcam configuration
router.get('/webcam/config', async (req, res) => {
  try {
    const config = await webcam.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List captured images
router.get('/webcam/images', async (req, res) => {
  try {
    const result = await webcam.listImages();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an image
router.delete('/webcam/images/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const result = await webcam.deleteImage(filename);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test webcam
router.get('/webcam/test', async (req, res) => {
  try {
    const result = await webcam.testWebcam();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;