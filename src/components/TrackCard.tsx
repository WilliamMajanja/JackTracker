
import React from 'react';
import { Track } from '../types';
import { CheckCircleIcon, XCircleIcon, SpinnerIcon, DownloadIcon } from './Icons';

interface TrackCardProps {
  track: Track;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const TrackCard: React.FC<TrackCardProps> = ({ track, onRemove, onRetry }) => {
    const { status, progress, trackName, artistName, albumArtUrl, duration, errorMessage, downloadUrl } = track;
    const isError = status === 'error';
    const isComplete = status === 'complete';
    const isDownloading = status === 'downloading';
    const isQueued = status === 'queued';

    return (
        <div className="group relative bg-spotify-gray-800/80 backdrop-blur-md border border-spotify-gray-700 hover:border-spotify-gray-600 rounded-xl p-3 flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:bg-spotify-gray-700/60 overflow-hidden">
            
            {/* Download Progress Bar */}
            {isDownloading && (
                <div 
                    className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-brand-spotify to-green-400 transition-all duration-200 ease-out z-10"
                    style={{ width: `${progress}%` }}
                />
            )}

            {/* Album Art Container */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-lg overflow-hidden shadow-black/50 shadow-md">
                <img
                    src={albumArtUrl}
                    alt={trackName}
                    onError={(event) => {
                        event.currentTarget.src = '/logo.svg';
                    }}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${isQueued ? 'opacity-50 grayscale' : 'opacity-100'}`}
                />
                
                {/* Status Overlays */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[1px]">
                    {isComplete && downloadUrl ? (
                        <a href={downloadUrl} download className="p-2 rounded-full text-white hover:scale-110 transition-transform" title="Download MP3">
                            <DownloadIcon className="w-8 h-8 drop-shadow-md" />
                        </a>
                    ) : isError ? (
                        <button onClick={() => onRetry?.(track.id)} className="px-2 py-1 bg-red-500/80 rounded text-[10px] font-bold text-white hover:bg-red-500">
                            RETRY
                        </button>
                    ) : null}
                </div>

                {isDownloading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-0">
                         <span className="text-white text-[10px] font-mono font-bold">{Math.round(progress)}%</span>
                    </div>
                )}
                
                {isQueued && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <SpinnerIcon className="w-5 h-5 text-white/70 animate-spin" />
                    </div>
                )}
            </div>

            {/* Track Details */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="flex justify-between items-center">
                    <h3 className={`font-bold text-sm sm:text-base truncate pr-2 ${isComplete ? 'text-white' : 'text-gray-300'}`}>
                        {trackName}
                    </h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 truncate">{artistName}</p>
                
                <div className="flex items-center gap-2 mt-1">
                     {duration && <span className="text-[10px] text-gray-500 font-mono bg-gray-800 px-1.5 py-0.5 rounded">{duration}</span>}
                     
                     {isError ? (
                        <span className="text-[10px] text-red-400 truncate">{errorMessage || "Error"}</span>
                    ) : isDownloading ? (
                        <span className="text-[10px] text-brand-spotify animate-pulse font-medium">Downloading...</span>
                    ) : isComplete ? (
                        <span className="text-[10px] text-brand-spotify flex items-center gap-1 font-medium">
                            <CheckCircleIcon className="w-3 h-3" /> Ready
                        </span>
                    ) : (
                        <span className="text-[10px] text-gray-500">In Queue</span>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
                  {isComplete && downloadUrl && (
                      <a
                        href={downloadUrl}
                        download
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95"
                        title="Download MP3"
                      >
                          <DownloadIcon className="w-5 h-5" />
                      </a>
                  )}
                 {(isComplete || isError || isQueued) && (
                     <button 
                        onClick={() => onRemove?.(track.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all active:scale-95"
                        title="Remove"
                     >
                         <XCircleIcon className="w-5 h-5" />
                     </button>
                 )}
            </div>
        </div>
    );
};
