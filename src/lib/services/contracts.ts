// Phase 2–6 boundaries only. No media, research or publishing implementation yet.
export interface VoiceService {
  synthesize(input: {
    text: string;
    language: string;
    voiceId: string;
  }): Promise<{ audioPath: string; durationSeconds: number }>;
}
export interface ResearchService {
  search(input: {
    query: string;
    language: string;
  }): Promise<Array<{ title: string; url: string; source: string }>>;
}
export interface MediaProcessingService {
  render(input: {
    projectId: string;
    aspectRatio: "9:16" | "16:9";
  }): Promise<{ videoPath: string }>;
}
