class PlayerStateManager {
  constructor() {
    this.state = {
      currentSong: null,
      isPlaying: false,
      volume: 75,
      position: 0,
      queue: [],
      lastUpdated: new Date()
    };
  }

  getCurrentState() {
    return { ...this.state };
  }

  async nextSong(io, queueManager) {
    try {
      // Get next approved song from queue
      const nextSong = await queueManager.getNextApproved();
      
      if (nextSong) {
        // Mark current song as played if exists
        if (this.state.currentSong) {
          await queueManager.update(this.state.currentSong.id, {
            playedAt: new Date(),
            status: 'played'
          });
        }
        
        // Update player state
        this.state.currentSong = nextSong;
        this.state.isPlaying = true;
        this.state.position = 0;
        this.state.lastUpdated = new Date();
        
        // Mark new song as playing
        await queueManager.update(nextSong.id, {
          status: 'playing',
          playedAt: new Date()
        });
        
        // Broadcast to all clients
        io.emit('now-playing', {
          song: nextSong,
          isPlaying: true,
          position: 0
        });
        
        // Broadcast updated queue
        const queue = await queueManager.list();
        io.emit('queue-update', { queue });
        
        return nextSong;
      } else {
        // No more songs, stop playback
        this.state.currentSong = null;
        this.state.isPlaying = false;
        this.state.position = 0;
        this.state.lastUpdated = new Date();
        
        io.emit('now-playing', {
          song: null,
          isPlaying: false,
          position: 0
        });
        
        return null;
      }
    } catch (error) {
      console.error('Error in nextSong:', error);
      throw error;
    }
  }

  setPlaying(isPlaying, io) {
    this.state.isPlaying = isPlaying;
    this.state.lastUpdated = new Date();
    
    io.emit('playback-state', {
      isPlaying,
      currentSong: this.state.currentSong,
      position: this.state.position
    });
  }

  setVolume(volume, io) {
    this.state.volume = Math.max(0, Math.min(100, volume));
    this.state.lastUpdated = new Date();
    
    io.emit('volume-change', {
      volume: this.state.volume
    });
  }

  updatePosition(position) {
    this.state.position = position;
    this.state.lastUpdated = new Date();
  }

  getNowPlaying() {
    return {
      song: this.state.currentSong,
      isPlaying: this.state.isPlaying,
      position: this.state.position,
      volume: this.state.volume
    };
  }

  async skipTo(songId, io, queueManager) {
    try {
      const queue = await queueManager.list();
      const song = queue.find(s => s.id === songId && s.status === 'approved');
      
      if (song) {
        // Mark current song as played
        if (this.state.currentSong) {
          await queueManager.update(this.state.currentSong.id, {
            playedAt: new Date(),
            status: 'played'
          });
        }
        
        // Update player state
        this.state.currentSong = song;
        this.state.isPlaying = true;
        this.state.position = 0;
        this.state.lastUpdated = new Date();
        
        // Mark target song as playing
        await queueManager.update(songId, {
          status: 'playing',
          playedAt: new Date()
        });
        
        // Broadcast changes
        io.emit('now-playing', {
          song,
          isPlaying: true,
          position: 0
        });
        
        const updatedQueue = await queueManager.list();
        io.emit('queue-update', { queue: updatedQueue });
        
        return song;
      }
      
      return null;
    } catch (error) {
      console.error('Error in skipTo:', error);
      throw error;
    }
  }

  reset() {
    this.state = {
      currentSong: null,
      isPlaying: false,
      volume: 75,
      position: 0,
      queue: [],
      lastUpdated: new Date()
    };
  }
}

export const playerState = new PlayerStateManager();
