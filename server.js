
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '32kb' }));

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

const fallbackMetadata = (url, title = 'Queued music link', artist = 'Unknown artist', thumbnail = '/logo.svg') => ([{
  trackName: title,
  artistName: artist,
  albumName: 'Unknown album',
  albumArtUrl: thumbnail,
  url,
}]);

const fetchOEmbedMetadata = async (url) => {
  const parsed = new URL(url);
  let endpoint;

  if (parsed.hostname.includes('spotify.com')) {
    endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
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
        && (!previousMtime || mtimeMs !== previousMtime || mtimeMs >= startedAt - 1000);
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

  // Strict implementation of download commands
  let cmd;
  let args;
  if (url.includes('spotify.com')) {
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

  if (url.includes('spotify.com') && result.code !== 0 && rateLimitPattern.test(result.output)) {
    const query = [artistName, trackName].filter(Boolean).join(' ').trim();
    if (query) {
      console.warn(`[${trackId}] spotDL rate limit detected; falling back to yt-dlp search for "${query}"`);
      sendWs(ws, { type: 'status', id: trackId, message: 'spotDL rate-limited; trying YouTube fallback...' });
      lastCmd = 'yt-dlp';
      result = await runDownloadCommand(ws, trackId, 'yt-dlp', buildYtDlpArgs(`ytsearch1:${query} audio`));
    }
  }

  if (result.code === 0) {
    const downloadedFile = findNewDownload(beforeFiles, startedAt);
    const downloadUrl = downloadedFile ? `/downloads/${encodeURIComponent(basename(downloadedFile))}` : undefined;
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

if (fs.existsSync(join(distDir, 'index.html'))) {
  app.get(/^(?!\/api\/|\/downloads\/).*/, (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
