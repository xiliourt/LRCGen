
export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING_AUDIO = 'PROCESSING_AUDIO',
  CONFIGURATION = 'CONFIGURATION',
  ISOLATING_VOCALS = 'ISOLATING_VOCALS',
  GENERATING_LRC = 'GENERATING_LRC',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface TrackMetadata {
  title?: string;
  artist?: string;
}

export interface LrcData {
  originalFileName: string;
  content: string;
  metadata?: TrackMetadata;
}

export interface AudioFile {
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export interface Track {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
  originalLyrics: string;
  useIsolation: boolean;
  status: 'PENDING' | 'ISOLATING' | 'GENERATING' | 'COMPLETED' | 'ERROR';
  lrcContent?: string;
  error?: string;
  metadata?: TrackMetadata;
}
