import { google } from 'googleapis';

class YouTubeService {
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || 'demo_key'
    });
  }

  async search(query) {
    try {
      const response = await this.youtube.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 1,
        videoCategoryId: '10', // Music category
        order: 'relevance'
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        const videoId = video.id.videoId;
        
        // Get additional video details
        const details = await this.getVideoDetails(videoId);
        
        return {
          videoId,
          title: video.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
          artist: video.snippet.channelTitle,
          duration: details.duration || 'Unknown'
        };
      }
      
      return null;
    } catch (error) {
      console.error('YouTube search error:', error);
      throw new Error(`YouTube search failed: ${error.message}`);
    }
  }

  async getVideoDetails(videoId) {
    try {
      const response = await this.youtube.videos.list({
        part: 'contentDetails,snippet',
        id: videoId
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        const duration = this.parseDuration(video.contentDetails.duration);
        
        return {
          videoId,
          title: video.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
          artist: video.snippet.channelTitle,
          duration
        };
      }
      
      return null;
    } catch (error) {
      console.error('YouTube video details error:', error);
      throw new Error(`Failed to get video details: ${error.message}`);
    }
  }

  extractVideoId(url) {
    const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  parseDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 'Unknown';
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  async validateAndGetSong(input) {
    // Check if input is a YouTube URL
    const videoId = this.extractVideoId(input);
    
    if (videoId) {
      // Direct YouTube link
      return await this.getVideoDetails(videoId);
    } else {
      // Search query
      return await this.search(input);
    }
  }
}

export const youtube = new YouTubeService();
