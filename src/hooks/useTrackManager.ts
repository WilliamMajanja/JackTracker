
import { useState, useEffect, useCallback, useRef } from 'react';
import { Track } from '../types';
import { fetchTrackMetadata } from '../../services/geminiService';

export const useTrackManager = () => {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isFetchingMeta, setIsFetchingMeta] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ws = useRef<WebSocket | null>(null);

    // Initialize WebSocket Connection
    useEffect(() => {
        const connect = () => {
            // Determine WS URL (use current host in browser, default to localhost:3001 if dev)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // If running in development with separate ports (3001/5173), hardcode 3001.
            // Otherwise assume same origin (production/proxy).
            const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
            const wsUrl = `${protocol}//${host}`;

            console.log('Connecting to WS:', wsUrl);
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('WebSocket Connected');
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'progress') {
                        setTracks(prev => prev.map(t => 
                            t.id === data.id ? { ...t, progress: data.progress, status: 'downloading' } : t
                        ));
                    } else if (data.type === 'complete') {
                        setTracks(prev => prev.map(t => 
                            t.id === data.id ? { ...t, progress: 100, status: 'complete' } : t
                        ));
                    } else if (data.type === 'error') {
                        setTracks(prev => prev.map(t => 
                            t.id === data.id ? { ...t, status: 'error', errorMessage: data.error } : t
                        ));
                    }
                } catch (e) {
                    console.error('WS Parse Error', e);
                }
            };

            socket.onclose = () => {
                console.log('WebSocket Disconnected. Reconnecting in 3s...');
                setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
                console.error('WebSocket Error:', err);
                // Don't close here, let onclose handle reconnection
            };

            ws.current = socket;
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    // Queue Processor: Sends download requests to Backend via WebSocket
    useEffect(() => {
        const queuedTracks = tracks.filter(t => t.status === 'queued');
        const downloadingTracks = tracks.filter(t => t.status === 'downloading');
        
        // Concurrency limit: 3
        if (queuedTracks.length === 0 || downloadingTracks.length >= 3) return;

        const nextTrack = queuedTracks[0];

        // Optimistically set to downloading to prevent double-send, 
        // though the backend will start sending progress shortly.
        setTracks(prev => prev.map(t => t.id === nextTrack.id ? { ...t, status: 'downloading' } : t));

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'download',
                id: nextTrack.id,
                url: nextTrack.url
            }));
        } else {
            // Fallback error if WS isn't ready
            setTracks(prev => prev.map(t => t.id === nextTrack.id ? { ...t, status: 'error', errorMessage: "Connection Error" } : t));
        }

    }, [tracks]);

    const addTrackByUrl = useCallback(async (url: string) => {
        if (!url.trim()) return;
        setError(null);
        setIsFetchingMeta(true);
        
        try {
            // We still use client-side Gemini for metadata to keep the app feeling "serverless" and fast
            // before offloading the heavy download task to the backend.
            const metadata = await fetchTrackMetadata(url);
            
            if (!metadata || metadata.length === 0) {
                 setError("Could not find any tracks for that link.");
            } else {
                const newTracks: Track[] = metadata.map(meta => ({
                    ...meta,
                    id: crypto.randomUUID(),
                    status: 'queued',
                    progress: 0,
                }));
                
                setTracks(prev => {
                    const existingUrls = new Set(prev.map(t => t.url));
                    const uniqueNewTracks = newTracks.filter(t => !existingUrls.has(t.url));
                    return [...prev, ...uniqueNewTracks];
                });
            }
        } catch (e: any) {
            setError(e.message || "Failed to process link.");
        } finally {
            setIsFetchingMeta(false);
        }
    }, []);

    const clearCompleted = useCallback(() => {
        setTracks(prev => prev.filter(t => t.status !== 'complete' && t.status !== 'error'));
    }, []);

    const retryTrack = useCallback((id: string) => {
        setTracks(prev => prev.map(t => t.id === id ? { ...t, status: 'queued', progress: 0, errorMessage: undefined } : t));
    }, []);

    const removeTrack = useCallback((id: string) => {
        setTracks(prev => prev.filter(t => t.id !== id));
    }, []);

    return {
        tracks,
        isFetchingMeta,
        error,
        setError,
        addTrackByUrl,
        clearCompleted,
        retryTrack,
        removeTrack
    };
};
