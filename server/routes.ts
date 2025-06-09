import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { storage } from "./storage";
import { queue } from "./lib/queue.js";
import { playerState } from "./lib/playerState.js";
import emailWebhook from "./lib/emailWebhook.js";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize queue connection
  await queue.connect();
  
  // Set up Socket.IO for real-time communication
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/socket.io",
    transports: ['polling'] // Disable WebSocket to avoid connection issues
  });
  
  // Make io available to other routes
  app.set('io', io);
  
  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send current state to new client
    socket.emit('now-playing', playerState.getNowPlaying());
    queue.list().then(queueData => {
      socket.emit('queue-update', { queue: queueData });
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
    
    // Handle client requests for current state
    socket.on('get-current-state', async () => {
      const currentQueue = await queue.list();
      const nowPlaying = playerState.getNowPlaying();
      
      socket.emit('queue-update', { queue: currentQueue });
      socket.emit('now-playing', nowPlaying);
    });
  });
  
  // Set up WebSocket server on separate path for compatibility
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', function connection(ws) {
    console.log('WebSocket client connected');
    
    ws.on('message', function message(data) {
      console.log('Received WebSocket message:', data.toString());
    });
    
    // Send initial state
    if (ws.readyState === WebSocket.OPEN) {
      queue.list().then(queueData => {
        ws.send(JSON.stringify({
          type: 'queue-update',
          data: { queue: queueData }
        }));
      });
    }
    
    ws.on('close', function close() {
      console.log('WebSocket client disconnected');
    });
  });

  // Email webhook routes
  app.use('/api', emailWebhook);

  // Player control routes
  app.post('/api/player/next', async (req, res) => {
    try {
      const nextSong = await playerState.nextSong(io, queue);
      res.json({ 
        success: true, 
        song: nextSong,
        message: nextSong ? 'Playing next song' : 'No more songs in queue'
      });
    } catch (error) {
      console.error('Error playing next song:', error);
      res.status(500).json({ error: 'Failed to play next song' });
    }
  });

  app.post('/api/player/play', async (req, res) => {
    try {
      playerState.setPlaying(true, io);
      res.json({ success: true, message: 'Playback started' });
    } catch (error) {
      console.error('Error starting playback:', error);
      res.status(500).json({ error: 'Failed to start playback' });
    }
  });

  app.post('/api/player/pause', async (req, res) => {
    try {
      playerState.setPlaying(false, io);
      res.json({ success: true, message: 'Playback paused' });
    } catch (error) {
      console.error('Error pausing playback:', error);
      res.status(500).json({ error: 'Failed to pause playback' });
    }
  });

  app.post('/api/player/volume', async (req, res) => {
    try {
      const { volume } = req.body;
      if (typeof volume !== 'number' || volume < 0 || volume > 100) {
        return res.status(400).json({ error: 'Volume must be a number between 0 and 100' });
      }
      
      playerState.setVolume(volume, io);
      res.json({ success: true, volume });
    } catch (error) {
      console.error('Error setting volume:', error);
      res.status(500).json({ error: 'Failed to set volume' });
    }
  });

  // Queue management routes
  app.post('/api/queue/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const updatedSong = await queue.update(id, { 
        status: 'approved',
        approvedAt: new Date()
      });
      
      if (updatedSong) {
        // Broadcast queue update
        const currentQueue = await queue.list();
        io.emit('queue-update', { queue: currentQueue });
        
        io.emit('notification', {
          type: 'song-approved',
          message: `Approved: ${updatedSong.title}`,
          song: updatedSong
        });
        
        res.json({ success: true, song: updatedSong });
      } else {
        res.status(404).json({ error: 'Song not found' });
      }
    } catch (error) {
      console.error('Error approving song:', error);
      res.status(500).json({ error: 'Failed to approve song' });
    }
  });

  app.post('/api/queue/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const updatedSong = await queue.update(id, { 
        status: 'rejected'
      });
      
      if (updatedSong) {
        // Broadcast queue update
        const currentQueue = await queue.list();
        io.emit('queue-update', { queue: currentQueue });
        
        io.emit('notification', {
          type: 'song-rejected',
          message: `Rejected: ${updatedSong.title}`,
          song: updatedSong
        });
        
        res.json({ success: true, song: updatedSong });
      } else {
        res.status(404).json({ error: 'Song not found' });
      }
    } catch (error) {
      console.error('Error rejecting song:', error);
      res.status(500).json({ error: 'Failed to reject song' });
    }
  });

  app.post('/api/queue/:id/play-next', async (req, res) => {
    try {
      const { id } = req.params;
      const song = await playerState.skipTo(id, io, queue);
      
      if (song) {
        res.json({ success: true, song });
      } else {
        res.status(404).json({ error: 'Song not found or not approved' });
      }
    } catch (error) {
      console.error('Error skipping to song:', error);
      res.status(500).json({ error: 'Failed to skip to song' });
    }
  });

  app.delete('/api/queue/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const removed = await queue.remove(id);
      
      if (removed) {
        // Broadcast queue update
        const currentQueue = await queue.list();
        io.emit('queue-update', { queue: currentQueue });
        
        res.json({ success: true, message: 'Song removed from queue' });
      } else {
        res.status(404).json({ error: 'Song not found' });
      }
    } catch (error) {
      console.error('Error removing song:', error);
      res.status(500).json({ error: 'Failed to remove song' });
    }
  });

  // Get current queue
  app.get('/api/queue', async (req, res) => {
    try {
      const currentQueue = await queue.list();
      const stats = {
        total: currentQueue.length,
        pending: currentQueue.filter(s => s.status === 'pending').length,
        approved: currentQueue.filter(s => s.status === 'approved').length,
        rejected: currentQueue.filter(s => s.status === 'rejected').length,
        played: currentQueue.filter(s => s.status === 'played').length
      };
      
      res.json({ queue: currentQueue, stats });
    } catch (error) {
      console.error('Error getting queue:', error);
      res.status(500).json({ error: 'Failed to get queue' });
    }
  });

  // Get player state
  app.get('/api/player/state', (req, res) => {
    try {
      const state = playerState.getNowPlaying();
      res.json(state);
    } catch (error) {
      console.error('Error getting player state:', error);
      res.status(500).json({ error: 'Failed to get player state' });
    }
  });

  // Clear queue (admin function)
  app.post('/api/queue/clear', async (req, res) => {
    try {
      await queue.clear();
      io.emit('queue-update', { queue: [] });
      res.json({ success: true, message: 'Queue cleared' });
    } catch (error) {
      console.error('Error clearing queue:', error);
      res.status(500).json({ error: 'Failed to clear queue' });
    }
  });

  return httpServer;
}
