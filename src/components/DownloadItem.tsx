import React from 'react';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { Track } from '../types';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { SpinnerIcon } from './Icons';

export const DownloadItem: React.FC<{ track: Track }> = ({ track }) => {
    const isError = track.status === 'error';
    const isDownloading = track.status === 'downloading';
    const isQueued = track.status === 'queued';

    // Status text below artist name
    const statusText = () => {
        if (isError) return <p className="text-red-400 text-sm mt-1">Download failed.</p>;
        if (isDownloading) return <p className="text-brand-spotify text-sm mt-1 animate-pulse">Downloading...</p>;
        if (isQueued) return <p className="text-spotify-gray-500 text-sm mt-1">Waiting in queue...</p>;
        return null;
    };

    return (
        <div className={`bg-spotify-gray-800 p-4 rounded-lg flex items-center space-x-4 border ${isError ? 'border-red-700' : 'border-spotify-gray-700'}`}>
            <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0" aria-label="Album art and download status">
                {/* Album Art Image */}
                <img src={track.albumArtUrl} alt={track.albumName} className="w-full h-full object-cover" />

                {/* Progress Overlay for Downloading state */}
                {isDownloading && (
                    <div 
                        className="absolute bottom-0 left-0 w-full bg-brand-spotify/70"
                        style={{ height: `${track.progress}%`, transition: 'height 0.2s ease-out' }}
                        role="progressbar"
                        aria-valuenow={track.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Downloading ${track.trackName}`}
                    >
                    </div>
                )}

                {/* Status Indicator Overlay (Spinner or Percentage) */}
                {(isDownloading || isQueued) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        {isDownloading ? (
                            <span className="text-white font-bold text-lg" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                                {Math.floor(track.progress)}%
                            </span>
                        ) : ( // isQueued
                            <SpinnerIcon className="w-8 h-8 text-white animate-spin" />
                        )}
                    </div>
                )}
            </div>
            
            <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-spotify-gray-100 truncate">{track.trackName}</p>
                <p className="text-sm text-spotify-gray-400 truncate">{track.artistName}</p>
                {statusText()}
            </div>
        </div>
    );
};