
export interface Track {
  id: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  url: string;
  duration?: string;
  status: 'queued' | 'downloading' | 'complete' | 'error';
  progress: number;
  errorMessage?: string;
  downloadUrl?: string;
}

export interface TrackMetadata {
  trackName: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  url: string;
  duration?: string;
}
