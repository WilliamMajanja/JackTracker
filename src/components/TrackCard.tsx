import React from 'react';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { Track } from '../types';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { DownloadIcon, PauseIcon, PlayIcon, XCircleIcon } from './Icons';

interface TrackCardProps {
  track: Track;
  onPreview: (track: Track) => void;
  isPlaying: boolean;
}

// Define the backend server address to construct absolute download links for preview/production.
const BACKEND_HOST = 'localhost:3001';
const BACKEND_URL = `${window.location.protocol}//${BACKEND_HOST}`;


export const TrackCard: React.FC<TrackCardProps> = ({ track, onPreview, isPlaying }) => {
    const isError = track.status === 'error';

    const downloadUrl = track.filePath
        ? (import.meta.env.DEV ? track.filePath : `${BACKEND_URL}${track.filePath}`)
        : '#';

    const handlePreviewClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isError) {
            onPreview(track);
        }
    };
  
    return (
        <div className={`relative bg-spotify-gray-800 p-4 rounded-lg shadow-md flex items-center space-x-4 border ${isError ? 'border-red-900/50' : 'border-spotify-gray-700'} transition-colors duration-300 w-full overflow-hidden`}>
            <img
                src={track.albumArtUrl}
                alt={track.albumName}
                className="w-16 h-16 rounded-md object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
                <p className={`text-lg font-semibold truncate ${isError ? 'text-spotify-gray-500' : 'text-spotify-gray-100'}`}>{track.trackName}</p>
                <p className="text-sm text-spotify-gray-400 truncate">{track.artistName}</p>
            </div>
            <div className="flex-shrink-0 flex items-center space-x-2">
                {isError ? (
                    <XCircleIcon className="w-7 h-7 text-red-500" />
                ) : (
                    <>
                        <button
                            onClick={handlePreviewClick}
                            aria-label={isPlaying ? `Pause preview of ${track.trackName}` : `Play 30-second preview of ${track.trackName}`}
                            className="p-2 rounded-full hover:bg-spotify-gray-600/50 transition-colors"
                        >
                            {isPlaying ? (
                                <PauseIcon className="w-7 h-7 text-brand-spotify" />
                            ) : (
                                <PlayIcon className="w-7 h-7 text-spotify-gray-100" />
                            )}
                        </button>
                        <a
                            href={downloadUrl}
                            download={track.fileName || track.trackName}
                            aria-label={`Download ${track.trackName}`}
                            className="p-2 rounded-full hover:bg-spotify-gray-600/50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DownloadIcon className="w-7 h-7 text-spotify-gray-100" />
                        </a>
                    </>
                )}
            </div>
            <div
                className="absolute bottom-0 left-0 h-1 bg-brand-spotify"
                style={{
                    width: isPlaying ? '100%' : '0%',
                    transition: isPlaying ? 'width 30s linear' : 'none',
                }}
                role="progressbar"
                aria-hidden={!isPlaying}
            />
        </div>
    );
};