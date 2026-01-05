// API Routes for Gellyroller
// Database-backed file management

import { Router } from 'express';
import db from './database.js';
import svgProcessor from './svg-processor.js';

export function createApiRoutes(jobManager) {
  const router = Router();

  // List all files
  router.get('/files', (req, res) => {
    try {
      const files = db.getAllFiles();
      res.json({ success: true, data: files });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get single file with content and settings
  router.get('/files/:id', async (req, res) => {
    try {
      const file = db.getFile(parseInt(req.params.id));
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      // Generate preview paths and stats
      let preview = null;
      let stats = null;

      if (file.type === 'svg') {
        const result = await svgProcessor.processToGcode(file.content, file.settings);
        if (result.success) {
          stats = result.stats;
          // Parse preview paths from the processor
          const paths = svgProcessor.parseSvgPaths(file.content);
          preview = svgProcessor.scalePaths(paths, file.settings);
        }
      } else {
        // G-code file - parse for preview
        preview = parseGcodeForPreview(file.content);
        stats = svgProcessor.calculateStats(file.content, file.settings);
      }

      res.json({
        success: true,
        data: {
          ...file,
          preview,
          stats
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Upload new file
  router.post('/files', async (req, res) => {
    try {
      const { filename, content } = req.body;

      if (!filename || !content) {
        return res.status(400).json({ success: false, error: 'Filename and content required' });
      }

      // Determine type
      const ext = filename.split('.').pop().toLowerCase();
      let type;
      if (ext === 'svg') {
        type = 'svg';
      } else if (['gcode', 'g', 'nc'].includes(ext)) {
        type = 'gcode';
      } else {
        return res.status(400).json({ success: false, error: 'Unsupported file type' });
      }

      const file = db.createFile(filename, type, content);
      res.json({ success: true, data: file });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete file
  router.delete('/files/:id', (req, res) => {
    try {
      const deleted = db.deleteFile(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get file settings
  router.get('/files/:id/settings', (req, res) => {
    try {
      const settings = db.getSettings(parseInt(req.params.id));
      if (!settings) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true, data: settings });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update file settings
  router.put('/files/:id/settings', async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const file = db.getFile(fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      db.updateSettings(fileId, req.body);

      // Return updated file with regenerated preview/stats
      const updatedFile = db.getFile(fileId);

      let preview = null;
      let stats = null;

      if (updatedFile.type === 'svg') {
        const result = await svgProcessor.processToGcode(updatedFile.content, updatedFile.settings);
        if (result.success) {
          stats = result.stats;
          const paths = svgProcessor.parseSvgPaths(updatedFile.content);
          preview = svgProcessor.scalePaths(paths, updatedFile.settings);
        }
      } else {
        preview = parseGcodeForPreview(updatedFile.content);
        stats = svgProcessor.calculateStats(updatedFile.content, updatedFile.settings);
      }

      res.json({
        success: true,
        data: {
          ...updatedFile,
          preview,
          stats
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset settings to defaults
  router.post('/files/:id/reset', (req, res) => {
    try {
      const settings = db.resetSettings(parseInt(req.params.id));
      if (!settings) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true, data: settings });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get settings history
  router.get('/files/:id/history', (req, res) => {
    try {
      const history = db.getSettingsHistory(parseInt(req.params.id));
      res.json({ success: true, data: history });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get generated G-code for file
  router.get('/files/:id/gcode', async (req, res) => {
    try {
      const file = db.getFile(parseInt(req.params.id));
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      let gcode;
      if (file.type === 'svg') {
        const result = await svgProcessor.processToGcode(file.content, file.settings);
        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error });
        }
        gcode = result.gcode;
      } else {
        gcode = file.content;
      }

      res.json({ success: true, data: { gcode } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Run file as job
  router.post('/files/:id/run', async (req, res) => {
    try {
      const file = db.getFile(parseInt(req.params.id));
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      let gcode;
      if (file.type === 'svg') {
        const result = await svgProcessor.processToGcode(file.content, file.settings);
        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error });
        }
        gcode = result.gcode;
      } else {
        gcode = file.content;
      }

      // Create job
      const job = jobManager.createJob(gcode, file.filename);

      res.json({
        success: true,
        data: {
          jobId: job.id,
          filename: file.filename
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get active job
  router.get('/job/active', (req, res) => {
    try {
      const job = jobManager.getActiveJob();
      if (!job) {
        return res.json({ success: true, data: null });
      }
      res.json({
        success: true,
        data: {
          id: job.id,
          filename: job.filename,
          state: job.state,
          gcode: job.gcode
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// Helper: Parse G-code into preview paths
function parseGcodeForPreview(gcode) {
  const paths = [];
  let currentPath = null;
  let x = 0, y = 0;
  let penDown = false;

  const lines = gcode.split('\n');
  for (const line of lines) {
    const clean = line.split(';')[0].trim().toUpperCase();
    if (!clean) continue;

    // Pen control
    if (clean.includes('M42') && clean.includes('P0')) {
      if (clean.includes('S1')) {
        penDown = true;
        currentPath = { points: [{ x, y }] };
      } else {
        penDown = false;
        if (currentPath && currentPath.points.length > 1) {
          paths.push(currentPath);
        }
        currentPath = null;
      }
      continue;
    }

    // Movement
    const gMatch = clean.match(/^G[01]\s/);
    if (gMatch) {
      const xMatch = clean.match(/X([-\d.]+)/);
      const yMatch = clean.match(/Y([-\d.]+)/);

      if (xMatch) x = parseFloat(xMatch[1]);
      if (yMatch) y = parseFloat(yMatch[1]);

      if (penDown && currentPath) {
        currentPath.points.push({ x, y });
      }
    }
  }

  // Close last path
  if (currentPath && currentPath.points.length > 1) {
    paths.push(currentPath);
  }

  return paths;
}

export default createApiRoutes;
