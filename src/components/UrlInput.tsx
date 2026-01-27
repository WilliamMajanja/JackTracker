
import React, { useMemo } from 'react';
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
    <div className="w-full max-w-3xl mx-auto relative z-10">
        <form onSubmit={handleSubmit} className="relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r from-brand-spotify to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 ${isLoading ? 'animate-pulse' : ''}`}></div>
            <div className="relative flex items-center bg-spotify-gray-900 border border-spotify-gray-700 rounded-full shadow-2xl overflow-hidden focus-within:border-brand-spotify/50 transition-colors duration-300">
                <div className="pl-6 pr-4 flex-shrink-0">
                    <Icon className={`w-6 h-6 transition-colors duration-300 ${url ? 'text-brand-spotify' : 'text-spotify-gray-500'}`} />
                </div>
                <input
                    type="url"
                    placeholder="Paste a Spotify or YouTube link..."
                    className="w-full py-5 bg-transparent text-spotify-gray-100 placeholder-spotify-gray-500 focus:outline-none text-lg"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                    required
                />
                <div className="pr-2">
                    <button
                        type="submit"
                        disabled={isLoading || !url.trim()}
                        className="bg-spotify-gray-100 hover:bg-white text-spotify-gray-900 disabled:bg-spotify-gray-700 disabled:text-spotify-gray-500 font-bold rounded-full h-10 px-6 flex items-center justify-center transition-all duration-300 transform active:scale-95"
                    >
                        {isLoading ? (
                            <SpinnerIcon className="animate-spin h-5 w-5" />
                        ) : (
                            <span className="flex items-center gap-2 text-sm">
                                Find
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </form>
    </div>
  );
};
