import React from 'react';
// FIX: Changed import path from alias to relative to resolve module not found error.
import { FolderIcon } from './Icons';

interface DirectoryInputProps {
  downloadDir: string;
  setDownloadDir: (dir: string) => void;
  isDisabled: boolean;
}

export const DirectoryInput: React.FC<DirectoryInputProps> = ({ downloadDir, setDownloadDir, isDisabled }) => {
  return (
    <div className="w-full max-w-2xl mx-auto mt-4">
      <div className="flex items-center bg-spotify-gray-800 border-2 border-spotify-gray-700 rounded-full shadow-lg overflow-hidden focus-within:border-brand-spotify transition-colors duration-300">
        <div className="pl-5 pr-3">
          <FolderIcon className="w-6 h-6 text-spotify-gray-400" />
        </div>
        <input
          id="downloadDir"
          type="text"
          placeholder="Optional: Download Subfolder Name"
          className="w-full py-3 bg-transparent text-spotify-gray-100 placeholder-spotify-gray-500 focus:outline-none"
          value={downloadDir}
          onChange={(e) => setDownloadDir(e.target.value)}
          disabled={isDisabled}
          aria-label="Download subfolder"
        />
      </div>
    </div>
  );
};