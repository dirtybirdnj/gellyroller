// Job Manager
// Manages job lifecycle, tracks execution state, and coordinates between parser, duet, and WebSocket

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import GCodeParser from './gcode-parser.js';

class JobManager extends EventEmitter {
  constructor(duet, wsServer, options = {}) {
    super();

    this.duet = duet;
    this.wsServer = wsServer;
    this.parser = new GCodeParser();
    this.devMode = options.devMode ?? (process.env.DEV_MODE === 'true');

    // Job storage
    this.jobs = new Map(); // jobId -> job
    this.activeJobId = null;

    // Progress update throttling
    this.progressUpdateIntervalMs = options.progressUpdateIntervalMs ?? 500;
    this._lastProgressUpdate = 0;

    // Wire up duet events
    if (this.duet) {
      this.duet.on('position', (position) => {
        this._onPositionUpdate(position);
      });
    }

    console.log('JobManager initialized');
  }

  // Create a new job from G-code content
  createJob(filename, content) {
    const jobId = uuidv4();

    // Parse the G-code
    const parsed = this.parser.parse(content, filename);

    const job = {
      id: jobId,
      filename: parsed.filename,
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,

      // Parsed metadata
      stats: parsed.stats,
      layers: parsed.layers,
      toolChanges: parsed.toolChanges,
      checkpoints: parsed.checkpoints,
      lines: parsed.lines,
      content: parsed.content,

      // Runtime progress
      progress: {
        currentLine: 0,
        totalLines: parsed.stats.totalLines,
        percentage: 0,
        currentLayer: 0,
        totalLayers: parsed.layers.length,
        elapsedMs: 0,
        estimatedRemainingMs: parsed.stats.estimatedTimeMs,
        currentPosition: { x: 0, y: 0, z: 0 }
      },

      // For rollback (future)
      history: [],

      // Error info
      error: null,

      // Execution control
      _abortController: null
    };

    this.jobs.set(jobId, job);

    // Emit event
    this.emit('job:created', job);
    if (this.wsServer) {
      this.wsServer.emitJobCreated(job);
    }

    console.log(`Job created: ${jobId} (${filename}, ${parsed.stats.totalLines} lines)`);

    return job;
  }

  // Get a job by ID
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  // List all jobs
  listJobs() {
    return Array.from(this.jobs.values()).map(job => ({
      id: job.id,
      filename: job.filename,
      status: job.status,
      createdAt: job.createdAt,
      stats: job.stats,
      progress: job.progress
    }));
  }

  // Delete a job
  deleteJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'running') {
      throw new Error('Cannot delete a running job');
    }

    this.jobs.delete(jobId);
    console.log(`Job deleted: ${jobId}`);
    return true;
  }

  // Start executing a job
  async startJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (this.activeJobId) {
      throw new Error(`Another job is already running: ${this.activeJobId}`);
    }

    if (job.status !== 'pending' && job.status !== 'paused') {
      throw new Error(`Job cannot be started from status: ${job.status}`);
    }

    // Update state
    job.status = 'running';
    job.startedAt = job.startedAt || Date.now();
    this.activeJobId = jobId;

    // Create abort controller for cancellation
    job._abortController = new AbortController();

    // Emit start event
    this.emit('job:started', job);
    if (this.wsServer) {
      this.wsServer.emitJobStarted(job);
    }

    console.log(`Job started: ${jobId}`);

    // Execute the job
    try {
      await this._executeJob(job);

      // Mark complete
      job.status = 'completed';
      job.completedAt = Date.now();
      job.progress.percentage = 100;
      this.activeJobId = null;

      this.emit('job:completed', job);
      if (this.wsServer) {
        this.wsServer.emitJobCompleted(job);
      }

      console.log(`Job completed: ${jobId}`);
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Job cancelled') {
        job.status = 'cancelled';
        console.log(`Job cancelled: ${jobId}`);
      } else if (job.status !== 'paused') {
        job.status = 'error';
        job.error = {
          message: err.message,
          line: err.line || job.progress.currentLine,
          command: err.command || null
        };
        console.error(`Job error: ${jobId}`, err.message);

        this.emit('job:error', job, job.error);
        if (this.wsServer) {
          this.wsServer.emitJobError(job, job.error);
        }
      }
      this.activeJobId = null;
    }

    return job;
  }

  // Pause the active job
  async pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'running') {
      throw new Error(`Job is not running: ${job.status}`);
    }

    // Tell duet to pause
    if (this.duet) {
      await this.duet.pause();
    }

    job.status = 'paused';
    job.history.push({
      timestamp: Date.now(),
      line: job.progress.currentLine,
      action: 'pause'
    });

    this.emit('job:paused', job);
    if (this.wsServer) {
      this.wsServer.emitJobPaused(job);
    }

    console.log(`Job paused: ${jobId} at line ${job.progress.currentLine}`);

    return job;
  }

  // Resume a paused job
  async resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'paused') {
      throw new Error(`Job is not paused: ${job.status}`);
    }

    job.history.push({
      timestamp: Date.now(),
      line: job.progress.currentLine,
      action: 'resume'
    });

    this.emit('job:resumed', job);
    if (this.wsServer) {
      this.wsServer.emitJobResumed(job);
    }

    console.log(`Job resuming: ${jobId} from line ${job.progress.currentLine}`);

    // Restart execution from current line
    return this.startJob(jobId);
  }

  // Cancel a job
  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'running' && job.status !== 'paused') {
      throw new Error(`Job cannot be cancelled from status: ${job.status}`);
    }

    // Abort execution
    if (job._abortController) {
      job._abortController.abort();
    }

    // Stop the machine
    if (this.duet) {
      await this.duet.stop();
    }

    job.status = 'cancelled';
    this.activeJobId = null;

    this.emit('job:cancelled', job);

    console.log(`Job cancelled: ${jobId}`);

    return job;
  }

  // Internal: Execute job line by line
  async _executeJob(job) {
    const startLine = job.progress.currentLine;
    const lines = job.content.split('\n');
    const startTime = Date.now();
    const previousElapsed = job.progress.elapsedMs;

    for (let i = startLine; i < lines.length; i++) {
      // Check for abort
      if (job._abortController?.signal.aborted) {
        throw new Error('Job cancelled');
      }

      // Check for pause
      if (job.status === 'paused') {
        return; // Exit, will resume later
      }

      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith(';')) {
        job.progress.currentLine = i + 1;
        continue;
      }

      // Send command to duet
      if (this.duet) {
        try {
          await this.duet.sendGCode(line);
        } catch (err) {
          err.line = i + 1;
          err.command = line;
          throw err;
        }
      } else if (this.devMode) {
        // Simulate execution time in dev mode
        await this._sleep(10);
      }

      // Update progress
      job.progress.currentLine = i + 1;
      job.progress.elapsedMs = previousElapsed + (Date.now() - startTime);

      // Update percentage
      job.progress.percentage = Math.round((job.progress.currentLine / job.progress.totalLines) * 100);

      // Estimate remaining time
      if (job.progress.currentLine > startLine) {
        const linesProcessed = job.progress.currentLine - startLine;
        const msPerLine = (Date.now() - startTime) / linesProcessed;
        const linesRemaining = job.progress.totalLines - job.progress.currentLine;
        job.progress.estimatedRemainingMs = Math.round(linesRemaining * msPerLine);
      }

      // Check for layer change
      this._checkLayerChange(job, i + 1);

      // Throttled progress update
      this._emitProgressUpdate(job);
    }
  }

  // Check if we've entered a new layer
  _checkLayerChange(job, lineNum) {
    for (const layer of job.layers) {
      if (lineNum === layer.startLine && job.progress.currentLayer !== layer.index) {
        job.progress.currentLayer = layer.index;

        this.emit('job:layer-change', job, layer);
        if (this.wsServer) {
          this.wsServer.emitLayerChange(job, layer);
        }

        console.log(`Layer change: ${layer.name} (layer ${layer.index + 1}/${job.layers.length})`);
        break;
      }
    }
  }

  // Throttled progress emission
  _emitProgressUpdate(job, force = false) {
    const now = Date.now();
    if (force || now - this._lastProgressUpdate >= this.progressUpdateIntervalMs) {
      this._lastProgressUpdate = now;

      this.emit('job:progress', job, job.progress);
      if (this.wsServer) {
        this.wsServer.emitJobProgress(job, job.progress);
      }
    }
  }

  // Handle position updates from duet
  _onPositionUpdate(position) {
    // Update active job's position
    if (this.activeJobId) {
      const job = this.jobs.get(this.activeJobId);
      if (job) {
        job.progress.currentPosition = position;
      }
    }

    // Broadcast position
    if (this.wsServer) {
      this.wsServer.emitPosition(position);
    }
  }

  // Utility sleep
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current active job
  getActiveJob() {
    if (!this.activeJobId) return null;
    return this.jobs.get(this.activeJobId);
  }

  // Get job progress for REST fallback
  getJobProgress(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      ...job.progress
    };
  }
}

export default JobManager;
