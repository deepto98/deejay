import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { youtube } from './youtube.js';
import { queue } from './queue.js';

const router = Router();

function verifyPostmarkSignature(body, signature, secret) {
  if (!secret || !signature) return true; // Skip verification if no secret configured
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
    
  return signature === expectedSignature;
}

function extractEmailContent(postmarkData) {
  // Extract plain text content and sender
  const textBody = postmarkData.TextBody || '';
  const fromEmail = postmarkData.From || postmarkData.FromFull?.Email || 'unknown@example.com';
  const subject = postmarkData.Subject || '';
  
  return {
    content: textBody.toLowerCase().trim(),
    requester: fromEmail,
    subject: subject
  };
}

function detectYouTubeLink(content) {
  const youtubeRegex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n?#\s]+)/i;
  const match = content.match(youtubeRegex);
  return match ? match[1] : null;
}

router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-postmark-signature'];
    const secret = process.env.POSTMARK_INBOUND_SECRET;
    
    // Verify signature if secret is configured
    if (secret && !verifyPostmarkSignature(req.body, signature, secret)) {
      console.warn('Invalid Postmark signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('Received email webhook:', {
      from: req.body.From,
      subject: req.body.Subject,
      textLength: req.body.TextBody?.length || 0
    });
    
    const { content, requester, subject } = extractEmailContent(req.body);
    
    if (!content) {
      console.warn('Empty email content from:', requester);
      return res.status(400).json({ error: 'Empty email content' });
    }
    
    // Detect YouTube link or use content as search query
    const videoId = detectYouTubeLink(content);
    let songData;
    let searchQuery = null;
    
    if (videoId) {
      // Direct YouTube link
      console.log('Processing YouTube link:', videoId);
      try {
        songData = await youtube.getVideoDetails(videoId);
      } catch (error) {
        console.error('Failed to get YouTube video details:', error);
        return res.status(400).json({ error: 'Invalid YouTube link' });
      }
    } else {
      // Search query
      searchQuery = content;
      console.log('Searching for:', searchQuery);
      try {
        songData = await youtube.search(content);
      } catch (error) {
        console.error('YouTube search failed:', error);
        return res.status(400).json({ error: 'Song search failed' });
      }
    }
    
    if (!songData) {
      console.warn('No song found for query:', content);
      return res.status(404).json({ error: 'Song not found' });
    }
    
    // Create song object
    const song = {
      id: uuidv4(),
      videoId: songData.videoId,
      title: songData.title,
      artist: songData.artist || 'Unknown Artist',
      duration: songData.duration || 'Unknown',
      url: songData.url,
      thumbnail: songData.thumbnail,
      requester: requester,
      status: 'pending',
      submittedAt: new Date(),
      searchQuery: searchQuery
    };
    
    // Add to queue
    await queue.push(song);
    
    console.log('Added song to queue:', {
      id: song.id,
      title: song.title,
      requester: song.requester,
      status: song.status
    });
    
    // Broadcast queue update via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const currentQueue = await queue.list();
      io.emit('queue-update', { 
        queue: currentQueue,
        newSong: song
      });
      
      // Send notification
      io.emit('notification', {
        type: 'new-request',
        message: `New song request: ${song.title} from ${song.requester}`,
        song: song
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Song added to queue',
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        status: song.status
      }
    });
    
  } catch (error) {
    console.error('Email webhook error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

export default router;
