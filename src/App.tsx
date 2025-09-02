import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { Track } from './types';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { UrlInput } from './components/UrlInput';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { TrackCard } from './components/TrackCard';
import { DownloadItem } from './components/DownloadItem';
import { DirectoryInput } from './components/DirectoryInput';

// Define the backend server address. In a real-world deployment,
// this would come from an environment variable.
const BACKEND_HOST = 'localhost:3001';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// In development, use the Vite proxy. In production/preview, connect directly.
const WEBSOCKET_URL = import.meta.env.DEV
  ? `${protocol}//${window.location.host}/ws`
  : `${protocol}//${BACKEND_HOST}/ws`;

const placeholderTrack: Track = {
    id: 'fetching-placeholder',
    trackName: 'Fetching track info...',
    artistName: 'Please wait...',
    albumName: '',
    albumArtUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23282828'/%3E%3C/svg%3E`,
    url: '',
    status: 'queued', // 'queued' status shows a spinner, which is perfect for a loading state
    progress: 0,
};

export const App: React.FC = () => {
    const [url, setUrl] = useState('');
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isFetchingMeta, setIsFetchingMeta] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [downloadDir, setDownloadDir] = useState<string>(() => {
        return localStorage.getItem('downloadDir') || '';
    });
    const [nowPlaying, setNowPlaying] = useState<{ id: string; audio: HTMLAudioElement; timerId: number } | null>(null);
    // FIX: Initialize useRef with an explicit initial value to resolve build error.
    const prevTracksRef = useRef<Track[] | undefined>(undefined);


    useEffect(() => {
        localStorage.setItem('downloadDir', downloadDir);
    }, [downloadDir]);

    useEffect(() => {
        return () => {
            if (nowPlaying) {
                nowPlaying.audio.pause();
                clearTimeout(nowPlaying.timerId);
            }
        };
    }, [nowPlaying]);

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimeout: number | null = null;

        const connect = () => {
            ws = new WebSocket(WEBSOCKET_URL);

            ws.onopen = () => {
                console.log('WebSocket connected');
                setSocket(ws);
                setError(null);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected. Attempting to reconnect...');
                setSocket(null);
                if (reconnectTimeout) clearTimeout(reconnectTimeout);
                reconnectTimeout = window.setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                setError("Connection to server failed. Please ensure the backend is running and refresh the page.");
                ws?.close();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'queue-update':
                        setIsFetchingMeta(false);
                        setTracks(prev => {
                            const newTracks = data.tracks.filter((newTrack: Track) => !prev.some(existing => existing.id === newTrack.id));
                            return [...prev, ...newTracks.map((t: Track) => ({...t, status: 'queued', progress: 0 }))]
                        });
                        break;
                    case 'progress':
                        setTracks(prev => prev.map(t => t.id === data.trackId ? {...t, progress: data.progress, status: 'downloading' } : t));
                        break;
                    case 'complete':
                        setTracks(prev => prev.map(t => t.id === data.track.id ? {...data.track, status: 'complete', progress: 100 } : t));
                        break;
                    case 'error':
                        if (data.trackId) {
                            setTracks(prev => prev.map(t => t.id === data.trackId ? {...t, status: 'error', progress: 0 } : t));
                        } else {
                            setError(data.message);
                            setIsFetchingMeta(false);
                        }
                        break;
                }
            };
        };

        connect();

        return () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) {
                // prevent reconnect on component unmount
                ws.onclose = null; 
                ws.close();
            }
        };
    }, []);

    const handleUrlSubmit = useCallback(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
             setError("Not connected to server. Please wait or refresh.");
             return;
        }
        if (!url.trim()) {
            setError('Please enter a valid URL.');
            return;
        }
        setError(null);
        setIsFetchingMeta(true);
        socket.send(JSON.stringify({ type: 'request-download', url, downloadDir }));
        setUrl('');
    }, [url, socket, downloadDir]);
    
    const handlePreview = useCallback((track: Track) => {
        if (nowPlaying) {
            nowPlaying.audio.pause();
            clearTimeout(nowPlaying.timerId);
            if (nowPlaying.id === track.id) {
                setNowPlaying(null);
                return;
            }
        }

        if (track.filePath) {
            const audioUrl = import.meta.env.DEV ? track.filePath : `${window.location.protocol}//${BACKEND_HOST}${track.filePath}`;
            const audio = new Audio(audioUrl);

            const timerId = window.setTimeout(() => {
                audio.pause();
                setNowPlaying(current => (current?.id === track.id ? null : current));
            }, 30000);

            audio.play().catch(e => {
                console.error("Audio preview failed:", e);
                clearTimeout(timerId);
                setError(`Could not play preview for ${track.trackName}.`);
            });

            setNowPlaying({ id: track.id, audio, timerId });
        }
    }, [nowPlaying]);
    
    // Autoplay logic for the first newly completed track
    useEffect(() => {
        const previousTracks = prevTracksRef.current ?? [];
        
        const newlyCompleted = tracks.filter(
            (track) =>
                track.status === 'complete' &&
                !previousTracks.some(
                    (prevTrack) => prevTrack.id === track.id && prevTrack.status === 'complete'
                )
        );

        // If there are newly completed tracks and nothing is currently playing, play the first one.
        if (newlyCompleted.length > 0 && !nowPlaying) {
            handlePreview(newlyCompleted[0]);
        }
        
        // Update the ref to the current tracks for the next render cycle.
        prevTracksRef.current = tracks;
    }, [tracks, nowPlaying, handlePreview]);

    const clearCompleted = useCallback(() => {
        setTracks(prev => prev.filter(t => t.status !== 'complete' && t.status !== 'error'));
    }, []);

    const activeDownloads = useMemo(() => tracks.filter(t => t.status === 'downloading' || t.status === 'queued'), [tracks]);
    const completedDownloads = useMemo(() => tracks.filter(t => t.status === 'complete' || t.status === 'error'), [tracks]);

    const isLoading = isFetchingMeta || !socket;

    return (
        <div className="min-h-screen bg-spotify-gray-900 font-sans p-4 sm:p-8">
            <main className="max-w-4xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-cyan-500 to-purple-600">
                        JackTracker
                    </h1>
                    <p className="mt-3 text-spotify-gray-400 max-w-2xl mx-auto">
                        Paste a Spotify or YouTube link to download your favorite audio.
                    </p>
                </header>

                <UrlInput 
                    url={url} 
                    setUrl={setUrl} 
                    onDownload={handleUrlSubmit} 
                    isLoading={isLoading} 
                />

                <DirectoryInput
                    downloadDir={downloadDir}
                    setDownloadDir={setDownloadDir}
                    isDisabled={isLoading || activeDownloads.length > 0}
                />
                
                {error && (
                    <div className="mt-6 text-center bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg max-w-2xl mx-auto">
                        {error}
                    </div>
                )}

                {isFetchingMeta && (
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold text-spotify-gray-100 mb-6 text-center sm:text-left">Fetching...</h2>
                        <div className="grid grid-cols-1 gap-4">
                            <DownloadItem key={placeholderTrack.id} track={placeholderTrack} />
                        </div>
                    </div>
                )}

                {activeDownloads.length > 0 && !isFetchingMeta && (
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold text-spotify-gray-100 mb-6 text-center sm:text-left">Active Downloads ({activeDownloads.length})</h2>
                        <div className="grid grid-cols-1 gap-4">
                            {activeDownloads.map(track => (
                                <DownloadItem key={track.id} track={track} />
                            ))}
                        </div>
                    </div>
                )}
                
                {completedDownloads.length > 0 && (
                    <div className="mt-12">
                         <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-spotify-gray-100 text-center sm:text-left">Completed ({completedDownloads.length})</h2>
                            <button 
                                onClick={clearCompleted} 
                                className="px-4 py-2 bg-spotify-gray-700 hover:bg-spotify-gray-600 text-spotify-gray-300 rounded-lg transition-colors text-sm font-semibold"
                            >
                                Clear Completed
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {completedDownloads.map(track => (
                                <TrackCard 
                                    key={track.id} 
                                    track={track} 
                                    onPreview={handlePreview}
                                    isPlaying={nowPlaying?.id === track.id}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
