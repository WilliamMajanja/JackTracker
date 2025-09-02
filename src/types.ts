
export interface Track {
  id: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  url: string; // The spotify URL for the track
  status: 'queued' | 'downloading' | 'complete' | 'error';
  progress: number;
  filePath?: string;
  fileName?: string;
}
