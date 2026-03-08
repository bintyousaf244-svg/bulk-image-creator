
export interface GeneratedImage {
  id: number;
  url: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export type AspectRatio = '1:1' | '16:9' | '9:16' | '3:4' | '4:3' | string;

export interface AppSettings {
  characterPrompt: string;
  bulkPrompts: string;
  aspectRatio: AspectRatio;
  delayTime: number; // in seconds
  style: string;
  colorTheme: string;
}

export interface RefImage {
  id: string;
  data: string; // base64
  mimeType: string;
}
