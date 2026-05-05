
import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { GoogleGenAI, Type } from "@google/genai";
import cors from 'cors';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.PORT || 3001;
const downloadsDir = join(__dirname, 'downloads');
const distDir = join(__dirname, 'dist');
const rateLimitPattern = /(429|too many requests|rate.?limit|24\s*h|24.?hour|daily limit)/i;
const spotifyHosts = new Set(['open.spotify.com', 'play.spotify.com']);
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be']);
const allowedDownloadCommands = new Set(['spotdl', 'yt-dlp']);
const requestCounts = new Map();
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120);
const downloadTimeToleranceMs = 1000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = requestCounts.get(key) || { count: 0, resetAt: now + rateLimitWindowMs };

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + rateLimitWindowMs;
  }

  entry.count += 1;
  requestCounts.set(key, entry);

  if (entry.count > rateLimitMaxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  next();
});

// Serve downloaded files statically so they can be retrieved by the frontend
app.use('/downloads', express.static(downloadsDir));
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// Initialize Gemini (Backend Instance)
const ai = process.env.API_KEY ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null;

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

const sendWs = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const isSupportedUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getPlatform = (url) => {
  const { hostname } = new URL(url);
  if (spotifyHosts.has(hostname)) return 'spotify';
  if (youtubeHosts.has(hostname)) return 'youtube';
  return 'generic';
};

const fallbackMetadata = (url, title = 'Queued music link', artist = 'Unknown artist', thumbnail = '/logo.svg') => ([{
  trackName: title,
  artistName: artist,
  albumName: 'Unknown album',
  albumArtUrl: thumbnail,
  url,
}]);

const normalizeSearchTerm = (value) => String(value || '')
  .replace(/[^\p{L}\p{N}\s.'’&(),-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120);

const fetchOEmbedMetadata = async (url) => {
  const platform = getPlatform(url);
  let endpoint;

  if (platform === 'spotify') {
    endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (platform === 'youtube') {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  } else {
    return fallbackMetadata(url);
  }

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`oEmbed failed with ${response.status}`);
  }

  const data = await response.json();
  const rawTitle = data.title || 'Queued music link';
  const [trackName, artistName] = rawTitle.includes(' • ')
    ? rawTitle.split(' • ', 2)
    : [rawTitle, data.author_name || 'Unknown artist'];

  return fallbackMetadata(url, trackName, artistName, data.thumbnail_url || '/logo.svg');
};

const getFallbackMetadata = async (url) => {
  try {
    return await fetchOEmbedMetadata(url);
  } catch (error) {
    console.warn(`Falling back to generic metadata: ${error.message}`);
    return fallbackMetadata(url);
  }
};

const listDownloadFiles = () => {
  if (!fs.existsSync(downloadsDir)) return new Map();
  return new Map(fs.readdirSync(downloadsDir).map((file) => [
    file,
    fs.statSync(join(downloadsDir, file)).mtimeMs,
  ]));
};

const findNewDownload = (beforeFiles, startedAt) => {
  if (!fs.existsSync(downloadsDir)) return null;

  const candidates = fs.readdirSync(downloadsDir)
    .map((file) => ({
      file,
      mtimeMs: fs.statSync(join(downloadsDir, file)).mtimeMs,
    }))
    .filter(({ file, mtimeMs }) => {
      const previousMtime = beforeFiles.get(file);
      return /\.(mp3|m4a|opus|ogg|wav|flac)$/i.test(file)
        && (!previousMtime || mtimeMs !== previousMtime || mtimeMs >= startedAt - downloadTimeToleranceMs);
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0]?.file || null;
};

const buildYtDlpArgs = (target) => ([
  '-x',
  '--audio-format', 'mp3',
  '--audio-quality', '0',
  '--no-playlist',
  '-o', join(downloadsDir, '%(title)s.%(ext)s'),
  target,
]);

const runDownloadCommand = (ws, trackId, cmd, args) => new Promise((resolve) => {
  if (!allowedDownloadCommands.has(cmd)) {
    resolve({ code: -1, output: `Unsupported download command: ${cmd}` });
    return;
  }

  const child = spawn(cmd, args, { shell: false });
  let output = '';

  const parseProgress = (data) => {
    const text = data.toString();
    output += text;

    const match = text.match(/(\d{1,3}(\.\d+)?)%/);
    if (match?.[1]) {
      const percent = parseFloat(match[1]);
      if (!Number.isNaN(percent) && percent <= 100) {
        sendWs(ws, { type: 'progress', id: trackId, progress: percent });
      }
    }
  };

  child.stdout.on('data', parseProgress);
  child.stderr.on('data', parseProgress);

  child.on('error', (err) => {
    output += err.message;
    resolve({ code: -1, output, error: err });
  });

  child.on('close', (code) => resolve({ code, output }));
});

// API Endpoint for Metadata
app.post('/api/metadata', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isSupportedUrl(url)) return res.status(400).json({ error: 'A valid http(s) URL is required' });

    console.log(`Fetching metadata for: ${url}`);

    if (!ai) {
      return res.json(await getFallbackMetadata(url));
    }
    
    const prompt = `Based on the following music URL, extract the metadata for the track, album, or playlist. 
        URL: ${url}
        Return the data as a JSON object conforming to the schema.`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
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
    res.json(await getFallbackMetadata(req.body.url));
  }
});

const handleDownload = async (ws, track) => {
  const { id: trackId, url, trackName, artistName } = track;

  if (!isSupportedUrl(url)) {
    sendWs(ws, { type: 'error', id: trackId, error: 'Invalid download URL' });
    return;
  }

  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  console.log(`[${trackId}] Starting download for: ${url}`);
  sendWs(ws, { type: 'status', id: trackId, message: 'Starting download...' });
  const platform = getPlatform(url);

  // Strict implementation of download commands
  let cmd;
  let args;
  if (platform === 'spotify') {
    cmd = 'spotdl';
    args = [
      'download', 
      url, 
      '--output', join(downloadsDir, '{artist} - {title}.{output-ext}'), 
      '--format', 'mp3',
      '--simple-tui'
    ];
  } else {
    cmd = 'yt-dlp';
    args = buildYtDlpArgs(url);
  }

  const beforeFiles = listDownloadFiles();
  const startedAt = Date.now();
  let lastCmd = cmd;
  let result = await runDownloadCommand(ws, trackId, cmd, args);

  if (platform === 'spotify' && result.code !== 0 && rateLimitPattern.test(result.output)) {
    const query = [artistName, trackName].map(normalizeSearchTerm).filter(Boolean).join(' ').trim();
    if (query) {
      console.warn(`[${trackId}] spotDL rate limit detected; falling back to yt-dlp search for "${query}"`);
      sendWs(ws, { type: 'status', id: trackId, message: 'spotDL rate-limited; trying YouTube fallback...' });
      lastCmd = 'yt-dlp';
      result = await runDownloadCommand(ws, trackId, 'yt-dlp', buildYtDlpArgs(`ytsearch1:${query} audio`));
    }
  }

  if (result.code === 0) {
    const downloadedFile = findNewDownload(beforeFiles, startedAt);
    const safeFile = downloadedFile
      && downloadedFile === basename(downloadedFile)
      && fs.existsSync(join(downloadsDir, downloadedFile))
      ? downloadedFile
      : null;
    const downloadUrl = safeFile ? `/downloads/${encodeURIComponent(safeFile)}` : undefined;
    console.log(`[${trackId}] Download complete`);
    sendWs(ws, { type: 'complete', id: trackId, downloadUrl });
  } else {
    console.error(`[${trackId}] Process exited with code ${result.code}: ${result.output}`);
    const missingTool = result.code === -1 && result.error?.code === 'ENOENT';
    sendWs(ws, {
      type: 'error',
      id: trackId,
      error: missingTool ? `Tool missing: ${lastCmd}` : 'Download failed',
    });
  }
};

// WebSocket for Download Management
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'download') {
        if (data.url && data.id) {
           handleDownload(ws, data);
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
