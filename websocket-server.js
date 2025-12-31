// WebSocket Server
// Manages WebSocket connections and broadcasts real-time updates

import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

class WSServer {
  constructor(httpServer, options = {}) {
    this.devMode = options.devMode ?? (process.env.DEV_MODE === 'true');
    this.clients = new Map(); // clientId -> { ws, subscriptions: Set }
    this.jobSubscriptions = new Map(); // jobId -> Set of clientIds

    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

    console.log('WebSocket server initialized on /ws');
  }

  _handleConnection(ws, req) {
    const clientId = uuidv4();

    // Store client info
    this.clients.set(clientId, {
      ws,
      subscriptions: new Set(),
      connectedAt: new Date()
    });

    console.log(`WebSocket client connected: ${clientId}`);

    // Send welcome message
    this._send(ws, {
      type: 'connected',
      data: { clientId }
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleMessage(clientId, message);
      } catch (err) {
        console.error('WebSocket message parse error:', err.message);
        this._send(ws, {
          type: 'error',
          data: { message: 'Invalid message format' }
        });
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      this._handleDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`WebSocket error for client ${clientId}:`, err.message);
    });

    // Ping to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  _handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        this._subscribeToJob(clientId, message.data?.jobId);
        break;

      case 'unsubscribe':
        this._unsubscribeFromJob(clientId, message.data?.jobId);
        break;

      case 'ping':
        this._send(client.ws, { type: 'pong', data: { timestamp: Date.now() } });
        break;

      default:
        console.log(`Unknown WebSocket message type: ${message.type}`);
    }
  }

  _handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all job subscriptions
    for (const jobId of client.subscriptions) {
      const jobSubs = this.jobSubscriptions.get(jobId);
      if (jobSubs) {
        jobSubs.delete(clientId);
        if (jobSubs.size === 0) {
          this.jobSubscriptions.delete(jobId);
        }
      }
    }

    this.clients.delete(clientId);
    console.log(`WebSocket client disconnected: ${clientId}`);
  }

  _subscribeToJob(clientId, jobId) {
    if (!jobId) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    // Add to client's subscriptions
    client.subscriptions.add(jobId);

    // Add to job's subscribers
    if (!this.jobSubscriptions.has(jobId)) {
      this.jobSubscriptions.set(jobId, new Set());
    }
    this.jobSubscriptions.get(jobId).add(clientId);

    console.log(`Client ${clientId} subscribed to job ${jobId}`);

    this._send(client.ws, {
      type: 'subscribed',
      data: { jobId }
    });
  }

  _unsubscribeFromJob(clientId, jobId) {
    if (!jobId) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(jobId);

    const jobSubs = this.jobSubscriptions.get(jobId);
    if (jobSubs) {
      jobSubs.delete(clientId);
      if (jobSubs.size === 0) {
        this.jobSubscriptions.delete(jobId);
      }
    }

    console.log(`Client ${clientId} unsubscribed from job ${jobId}`);

    this._send(client.ws, {
      type: 'unsubscribed',
      data: { jobId }
    });
  }

  _send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
    }
  }

  // Broadcast to all connected clients
  broadcast(event) {
    const message = {
      ...event,
      timestamp: Date.now()
    };
    const payload = JSON.stringify(message);

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  // Broadcast only to clients subscribed to a specific job
  broadcastToJob(jobId, event) {
    const subscribers = this.jobSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) return;

    const message = {
      ...event,
      timestamp: Date.now()
    };
    const payload = JSON.stringify(message);

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  // Convenience methods for common events

  emitJobCreated(job) {
    this.broadcast({
      type: 'job:created',
      data: {
        jobId: job.id,
        filename: job.filename,
        stats: job.stats,
        layers: job.layers.length
      }
    });
  }

  emitJobStarted(job) {
    this.broadcastToJob(job.id, {
      type: 'job:started',
      data: {
        jobId: job.id,
        startedAt: job.startedAt
      }
    });
  }

  emitJobProgress(job, progress) {
    this.broadcastToJob(job.id, {
      type: 'job:progress',
      data: {
        jobId: job.id,
        ...progress
      }
    });
  }

  emitLayerChange(job, layer) {
    this.broadcastToJob(job.id, {
      type: 'job:layer-change',
      data: {
        jobId: job.id,
        layer: layer.index,
        layerName: layer.name,
        color: layer.color,
        tool: layer.tool
      }
    });
  }

  emitJobPaused(job) {
    this.broadcastToJob(job.id, {
      type: 'job:paused',
      data: {
        jobId: job.id,
        pausedAt: Date.now()
      }
    });
  }

  emitJobResumed(job) {
    this.broadcastToJob(job.id, {
      type: 'job:resumed',
      data: {
        jobId: job.id,
        resumedAt: Date.now()
      }
    });
  }

  emitJobCompleted(job) {
    this.broadcastToJob(job.id, {
      type: 'job:completed',
      data: {
        jobId: job.id,
        elapsedMs: job.completedAt - job.startedAt,
        totalLines: job.stats.totalLines
      }
    });
  }

  emitJobError(job, error) {
    this.broadcastToJob(job.id, {
      type: 'job:error',
      data: {
        jobId: job.id,
        error: error.message,
        line: error.line || null,
        command: error.command || null
      }
    });
  }

  emitPosition(position) {
    this.broadcast({
      type: 'position:update',
      data: position
    });
  }

  emitMachineStatus(status) {
    this.broadcast({
      type: 'machine:status',
      data: status
    });
  }

  // Get connection stats
  getStats() {
    return {
      totalClients: this.clients.size,
      activeSubscriptions: this.jobSubscriptions.size
    };
  }

  // Start ping interval to detect dead connections
  startHeartbeat(intervalMs = 30000) {
    this._heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.ws.isAlive) {
          console.log(`Client ${clientId} failed heartbeat, terminating`);
          client.ws.terminate();
          this._handleDisconnect(clientId);
          continue;
        }
        client.ws.isAlive = false;
        client.ws.ping();
      }
    }, intervalMs);
  }

  // Clean shutdown
  close() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
    }
    this.wss.close();
    console.log('WebSocket server closed');
  }
}

export default WSServer;
