import { createClient } from 'redis';

class QueueManager {
  constructor() {
    this.isRedis = !!process.env.REDIS_URL;
    this.memoryQueue = [];
    this.redisClient = null;
    
    if (this.isRedis) {
      this.redisClient = createClient({
        url: process.env.REDIS_URL
      });
      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isRedis = false; // Fallback to memory
      });
    }
  }

  async connect() {
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.connect();
        console.log('Connected to Redis for queue management');
      } catch (error) {
        console.error('Failed to connect to Redis, falling back to memory:', error);
        this.isRedis = false;
      }
    }
  }

  async push(song) {
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.lPush('dj:queue', JSON.stringify(song));
        return song;
      } catch (error) {
        console.error('Redis push error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    this.memoryQueue.unshift(song);
    return song;
  }

  async shift() {
    if (this.isRedis && this.redisClient) {
      try {
        const songStr = await this.redisClient.rPop('dj:queue');
        return songStr ? JSON.parse(songStr) : null;
      } catch (error) {
        console.error('Redis shift error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    return this.memoryQueue.pop() || null;
  }

  async list() {
    if (this.isRedis && this.redisClient) {
      try {
        const songs = await this.redisClient.lRange('dj:queue', 0, -1);
        return songs.map(s => JSON.parse(s));
      } catch (error) {
        console.error('Redis list error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    return [...this.memoryQueue];
  }

  async update(id, updates) {
    if (this.isRedis && this.redisClient) {
      try {
        const songs = await this.redisClient.lRange('dj:queue', 0, -1);
        const parsedSongs = songs.map(s => JSON.parse(s));
        const index = parsedSongs.findIndex(song => song.id === id);
        
        if (index !== -1) {
          parsedSongs[index] = { ...parsedSongs[index], ...updates };
          await this.redisClient.del('dj:queue');
          for (let i = parsedSongs.length - 1; i >= 0; i--) {
            await this.redisClient.lPush('dj:queue', JSON.stringify(parsedSongs[i]));
          }
          return parsedSongs[index];
        }
        return null;
      } catch (error) {
        console.error('Redis update error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    const index = this.memoryQueue.findIndex(song => song.id === id);
    if (index !== -1) {
      this.memoryQueue[index] = { ...this.memoryQueue[index], ...updates };
      return this.memoryQueue[index];
    }
    return null;
  }

  async remove(id) {
    if (this.isRedis && this.redisClient) {
      try {
        const songs = await this.redisClient.lRange('dj:queue', 0, -1);
        const parsedSongs = songs.map(s => JSON.parse(s));
        const filteredSongs = parsedSongs.filter(song => song.id !== id);
        
        await this.redisClient.del('dj:queue');
        for (let i = filteredSongs.length - 1; i >= 0; i--) {
          await this.redisClient.lPush('dj:queue', JSON.stringify(filteredSongs[i]));
        }
        return true;
      } catch (error) {
        console.error('Redis remove error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    const index = this.memoryQueue.findIndex(song => song.id === id);
    if (index !== -1) {
      this.memoryQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  async getNextApproved() {
    const queue = await this.list();
    return queue.find(song => song.status === 'approved' && !song.playedAt) || null;
  }

  async clear() {
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.del('dj:queue');
        return;
      } catch (error) {
        console.error('Redis clear error, falling back to memory:', error);
        this.isRedis = false;
      }
    }
    
    // Memory fallback
    this.memoryQueue = [];
  }
}

export const queue = new QueueManager();
