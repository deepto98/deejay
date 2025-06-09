import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const songs = pgTable("songs", {
  id: text("id").primaryKey(), // UUID
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist"),
  duration: text("duration"),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  requester: text("requester").notNull(), // email address
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  submittedAt: timestamp("submitted_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  playedAt: timestamp("played_at"),
  searchQuery: text("search_query"), // original search if not direct link
});

export const playerState = pgTable("player_state", {
  id: serial("id").primaryKey(),
  currentSongId: text("current_song_id"),
  isPlaying: boolean("is_playing").default(false),
  volume: integer("volume").default(75),
  position: integer("position").default(0), // seconds
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertSongSchema = createInsertSchema(songs).pick({
  id: true,
  videoId: true,
  title: true,
  artist: true,
  duration: true,
  url: true,
  thumbnail: true,
  requester: true,
  status: true,
  searchQuery: true,
});

export const insertPlayerStateSchema = createInsertSchema(playerState).pick({
  currentSongId: true,
  isPlaying: true,
  volume: true,
  position: true,
});

export type InsertSong = z.infer<typeof insertSongSchema>;
export type Song = typeof songs.$inferSelect;
export type InsertPlayerState = z.infer<typeof insertPlayerStateSchema>;
export type PlayerState = typeof playerState.$inferSelect;

// Legacy user schema to maintain compatibility
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
