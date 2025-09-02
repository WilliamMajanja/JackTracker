import React, { useMemo } from 'react';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { DownloadIcon, SpotifyIcon, SpinnerIcon, YouTubeIcon, LinkIcon } from './Icons';

interface UrlInputProps {
  url: string;
  setUrl: (url: string) => void;
  onDownload: () => void;
  isLoading: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({ url, setUrl, onDownload, isLoading }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading) {
      onDownload();
    }
  };

  const Icon = useMemo(() => {
    const trimmedUrl = url.trim();
    if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
      return YouTubeIcon;
    }
    if (trimmedUrl.includes('spotify.com')) {
      return SpotifyIcon;
    }
    return LinkIcon;
  }, [url]);

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex items-center bg-spotify-gray-800 border-2 border-spotify-gray-700 rounded-full shadow-lg overflow-hidden focus-within:border-brand-spotify transition-colors duration-300">
        <div className="pl-5 pr-3">
          <Icon className="w-6 h-6 text-spotify-gray-400" />
        </div>
        <input
          type="url"
          placeholder="Paste a Spotify or YouTube link here..."
          className="w-full py-4 bg-transparent text-spotify-gray-100 placeholder-spotify-gray-500 focus:outline-none"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-brand-spotify hover:bg-green-600 disabled:bg-spotify-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-full h-12 w-16 md:w-28 flex items-center justify-center m-2 transition-all duration-300 transform"
        >
          {isLoading ? (
            <SpinnerIcon className="animate-spin h-6 w-6" />
          ) : (
            <DownloadIcon className="h-6 w-6" />
          )}
        </button>
      </div>
    </form>
  );
};