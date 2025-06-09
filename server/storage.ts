import { songs, playerState, type Song, type InsertSong, type PlayerState, type InsertPlayerState, type User, type InsertUser } from "@shared/schema";

export interface IStorage {
  // User methods (legacy compatibility)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Song methods
  getSong(id: string): Promise<Song | undefined>;
  createSong(song: InsertSong): Promise<Song>;
  updateSong(id: string, updates: Partial<Song>): Promise<Song | undefined>;
  deleteSong(id: string): Promise<boolean>;
  getAllSongs(): Promise<Song[]>;
  getSongsByStatus(status: string): Promise<Song[]>;
  
  // Player state methods
  getPlayerState(): Promise<PlayerState | undefined>;
  updatePlayerState(state: InsertPlayerState): Promise<PlayerState>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private songs: Map<string, Song>;
  private currentPlayerState: PlayerState | null;
  private currentUserId: number;

  constructor() {
    this.users = new Map();
    this.songs = new Map();
    this.currentPlayerState = null;
    this.currentUserId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Song methods
  async getSong(id: string): Promise<Song | undefined> {
    return this.songs.get(id);
  }

  async createSong(song: InsertSong): Promise<Song> {
    const newSong: Song = {
      ...song,
      submittedAt: new Date(),
      approvedAt: null,
      playedAt: null,
    };
    this.songs.set(song.id, newSong);
    return newSong;
  }

  async updateSong(id: string, updates: Partial<Song>): Promise<Song | undefined> {
    const song = this.songs.get(id);
    if (!song) return undefined;

    const updatedSong = { ...song, ...updates };
    this.songs.set(id, updatedSong);
    return updatedSong;
  }

  async deleteSong(id: string): Promise<boolean> {
    return this.songs.delete(id);
  }

  async getAllSongs(): Promise<Song[]> {
    return Array.from(this.songs.values()).sort(
      (a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0)
    );
  }

  async getSongsByStatus(status: string): Promise<Song[]> {
    return Array.from(this.songs.values())
      .filter(song => song.status === status)
      .sort((a, b) => (a.submittedAt?.getTime() || 0) - (b.submittedAt?.getTime() || 0));
  }

  // Player state methods
  async getPlayerState(): Promise<PlayerState | undefined> {
    return this.currentPlayerState || undefined;
  }

  async updatePlayerState(state: InsertPlayerState): Promise<PlayerState> {
    const newState: PlayerState = {
      id: 1,
      ...state,
      lastUpdated: new Date(),
    };
    this.currentPlayerState = newState;
    return newState;
  }
}

export const storage = new MemStorage();
