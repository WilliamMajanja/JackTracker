
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Type } from "@google/genai";
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve downloaded files statically so they can be retrieved by the frontend
app.use('/downloads', express.static(join(__dirname, 'downloads')));

// Initialize Gemini (Backend Instance)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Shared Schema Definition
const schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      trackName: { type: Type.STRING },
      artistName: { type: Type.STRING },
      albumName: { type: Type.STRING },
      albumArtUrl: { type: Type.STRING },
      url: { type: Type.STRING },
      duration: { type: Type.STRING }
    },
    required: ["trackName", "artistName", "albumName", "albumArtUrl", "url"]
  }
};

// API Endpoint for Metadata
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`Fetching metadata for: ${url}`);
    
    const prompt = `Based on the following music URL, extract the metadata for the track, album, or playlist. 
        URL: ${url}
        Return the data as a JSON object conforming to the schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const jsonString = response.text?.trim();
    if (!jsonString) throw new Error("Empty response from Gemini");

    const data = JSON.parse(jsonString);
    res.json(Array.isArray(data) ? data : [data]);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Helper to handle downloads strictly
const handleDownload = (ws, trackId, url) => {
  const downloadsDir = join(__dirname, 'downloads');
  
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  console.log(`[${trackId}] Starting download for: ${url}`);

  let cmd;
  let args = [];

  // Strict implementation of download commands
  if (url.includes('spotify.com')) {
    // spotDL Command Structure:
    // spotdl download [url] --output [template] --format mp3 --simple-tui
    cmd = 'spotdl';
    args = [
      'download', 
      url, 
      '--output', join(downloadsDir, '{artist} - {title}.{output-ext}'), 
      '--format', 'mp3',
      '--simple-tui' // Minimal UI output for easier parsing
    ];
  } else {
    // yt-dlp Command Structure:
    // yt-dlp -x --audio-format mp3 --audio-quality 0 -o [template] [url]
    cmd = 'yt-dlp';
    args = [
      '-x', // Extract audio
      '--audio-format', 'mp3', 
      '--audio-quality', '0', // 0 is best quality (VBR)
      '-o', join(downloadsDir, '%(title)s.%(ext)s'), 
      url
    ];
  }

  // Use shell: true for better cross-platform compatibility (Windows/Linux)
  // strict stdio handling to ensure we capture progress
  const child = spawn(cmd, args, { shell: true });

  // Parse progress from stdout/stderr
  const parseProgress = (data) => {
    const text = data.toString();
    
    // Strict regex to capture percentage (e.g., 45.5% or 45%)
    // Matches standard output from both tools
    const match = text.match(/(\d{1,3}(\.\d+)?)%/);
    if (match && match[1]) {
      const percent = parseFloat(match[1]);
      if (!isNaN(percent) && percent <= 100) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'progress', id: trackId, progress: percent }));
        }
      }
    }
  };

  child.stdout.on('data', parseProgress);
  child.stderr.on('data', parseProgress); // yt-dlp typically writes progress to stderr

  child.on('error', (err) => {
    console.error(`[${trackId}] Spawn error:`, err);
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', id: trackId, error: `Tool missing: ${cmd}` }));
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log(`[${trackId}] Download complete`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'complete', id: trackId }));
      }
    } else {
      console.error(`[${trackId}] Process exited with code ${code}`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', id: trackId, error: 'Download failed' }));
      }
    }
  });
};

// WebSocket for Download Management
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'download') {
        if (data.url && data.id) {
           handleDownload(ws, data.id, data.url);
        }
      }
    } catch (e) {
      console.error("WebSocket Error:", e);
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
