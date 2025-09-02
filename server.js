



import express from 'express';
import cors from 'cors';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import util from 'util';

const execPromise = util.promisify(exec);

const app = express();
const port = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const downloadsDir = path.join(__dirname, 'downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

app.use(cors());
app.use('/downloads', express.static(downloadsDir));

// --- WebSocket Server Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = request.url;

    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data, { binary: false });
    }
  });
};

function sanitize(input) {
  if (!input) return '';
  // Removes characters that are illegal in Windows filenames/paths,
  // which is a superset of illegal characters on other OSes.
  // Also remove leading/trailing dots and spaces.
  return input.replace(/[<>:"/\\|?*]/g, '_').trim().replace(/^\.+|\.+$/g, '').trim();
}

// --- Download Queue Logic ---
let downloadQueue = [];
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 3;

async function processQueue() {
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) {
        return;
    }

    activeDownloads++;
    const track = downloadQueue.shift();

    try {
        const sanitizedSubDir = track.downloadDir ? sanitize(track.downloadDir) : '';
        const targetDir = path.join(downloadsDir, sanitizedSubDir);

        if (sanitizedSubDir && !fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        let fileName;
        if (track.downloader === 'yt-dlp' && track.playlistIndex) {
            // Per the guide, YouTube playlist tracks are numbered to preserve order.
            // Format: "01 - Track Name.mp3", "02 - Track Name.mp3", etc.
            const indexStr = String(track.playlistIndex).padStart(2, '0');
            fileName = `${indexStr} - ${sanitize(track.trackName)}.mp3`;
        } else {
            // Default naming for Spotify, single YouTube videos, etc.
            fileName = `${sanitize(track.artistName)} - ${sanitize(track.trackName)}.mp3`;
        }
        
        const fullPath = path.join(targetDir, fileName);
        const fileUrl = path.join('/downloads', sanitizedSubDir, encodeURIComponent(fileName)).replace(/\\/g, '/');

        if (fs.existsSync(fullPath)) {
            console.log(`File already exists: ${fileName}`);
            wss.broadcast(JSON.stringify({ type: 'complete', track: { ...track, filePath: fileUrl, fileName } }));
            activeDownloads--;
            processQueue();
            return;
        }

        let downloaderProcess;
        if (track.downloader === 'spotdl') {
            const args = ['download', track.url, '--format', 'mp3', '--bitrate', '320k', '--output', fullPath];
            downloaderProcess = spawn('spotdl', args);
        } else if (track.downloader === 'yt-dlp') {
            const args = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-thumbnail', '-o', fullPath, track.url];
            downloaderProcess = spawn('yt-dlp', args);
        } else {
            throw new Error(`Unknown downloader: ${track.downloader}`);
        }

        downloaderProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[${track.downloader}] ${output.trim()}`);
            const progressMatch = output.match(/\[download\]\s+([\d.]+)%/);
            if (progressMatch && progressMatch[1]) {
                const progress = parseFloat(progressMatch[1]);
                wss.broadcast(JSON.stringify({ type: 'progress', trackId: track.id, progress }));
            }
        });

        downloaderProcess.stderr.on('data', (data) => {
            console.error(`[${track.downloader}-stderr] for ${track.trackName}: ${data.toString().trim()}`);
        });

        downloaderProcess.on('close', (code) => {
            activeDownloads--;
            if (code === 0 && fs.existsSync(fullPath)) {
                console.log(`Download complete: ${fileName}`);
                wss.broadcast(JSON.stringify({ type: 'complete', track: { ...track, filePath: fileUrl, fileName } }));
            } else {
                console.error(`${track.downloader} process exited with code ${code} for track ${track.trackName}`);
                wss.broadcast(JSON.stringify({ type: 'error', trackId: track.id, message: `Download failed with exit code ${code}.` }));
            }
            processQueue();
        });

    } catch (error) {
        console.error(`Error processing track ${track.trackName}:`, error);
        wss.broadcast(JSON.stringify({ type: 'error', trackId: track.id, message: error.message }));
        activeDownloads--;
        processQueue();
    }
}

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type !== 'request-download' || !data.url) {
                return;
            }

            let tracks = [];
            const { url, downloadDir } = data;

            if (url.includes('spotify.com')) {
                const command = `spotdl meta "${url}"`;
                const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 });
                if (stderr && !stdout.trim()) {
                    throw new Error(`spotdl meta command failed. stderr: ${stderr}`);
                }
                const results = stdout.trim().split('\n').filter(line => line.startsWith('{') && line.endsWith('}')).map(line => JSON.parse(line));
                if (results.length === 0) {
                     throw new Error(`spotdl meta command returned no valid track data. stderr: ${stderr}`);
                }
                tracks = results.map(t => ({
                    id: t.song_id || crypto.randomUUID(),
                    trackName: t.name,
                    artistName: t.artists.join(', '),
                    albumName: t.album_name,
                    albumArtUrl: t.cover_url,
                    url: t.url,
                    downloader: 'spotdl',
                    downloadDir: downloadDir || ''
                }));
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const command = `yt-dlp -j --flat-playlist "${url}"`;
                const { stdout, stderr } = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
                 if (stderr && !stdout.trim()) {
                    throw new Error(`yt-dlp meta command failed. stderr: ${stderr}`);
                }
                const results = stdout.trim().split('\n').map(line => JSON.parse(line));
                if (results.length === 0) {
                    throw new Error(`yt-dlp meta command returned no valid track data. stderr: ${stderr}`);
                }
                tracks = results.map((t, index) => ({
                    id: t.id || crypto.randomUUID(),
                    trackName: t.title,
                    artistName: t.uploader || t.channel || 'Unknown Artist',
                    albumName: t.album || 'Unknown Album',
                    albumArtUrl: t.thumbnail,
                    url: t.webpage_url,
                    downloader: 'yt-dlp',
                    downloadDir: downloadDir || '',
                    playlistIndex: results.length > 1 ? index + 1 : null
                }));
            } else {
                throw new Error('Invalid URL. Please provide a Spotify or YouTube link.');
            }

            if (tracks.length > 0) {
                downloadQueue.push(...tracks);
                ws.send(JSON.stringify({ type: 'queue-update', tracks }));
                for (let i = 0; i < MAX_CONCURRENT_DOWNLOADS; i++) {
                    processQueue();
                }
            } else {
                 ws.send(JSON.stringify({ type: 'error', trackId: null, message: `No tracks found at the provided URL.`}));
            }
        } catch (error) {
            console.error('Failed to process message or fetch metadata:', error);
            const userMessage = error.message.includes('Invalid URL') 
                ? error.message 
                : `Failed to process link. Check if it's a valid public URL and try again.`;
            ws.send(JSON.stringify({ type: 'error', trackId: null, message: userMessage}));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(port, () => {
    console.log(`JackTracker server listening at http://localhost:${port}`);
    console.log(`Serving downloads from: ${downloadsDir}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  // Close all WebSocket connections
  for (const client of wss.clients) {
    client.close();
  }

  // Close the HTTP server
  server.close(() => {
    console.log('Server has been shut down.');
    process.exit(0);
  });

  // Force shutdown after a timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));