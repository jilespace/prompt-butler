export interface GrabTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  builtIn: boolean;
  updatedAt: string;
}

export interface GrabResult {
  id: string;
  imageUrl: string;
  thumbnail: string;
  templateId: string;
  templateName: string;
  model: string;
  provider: string;
  promptEn: string;
  promptZh: string;
  negativePrompt: string;
  notes: string;
  createdAt: string;
}

export interface GrabGenerationInput {
  imageUrl: string;
  templateId: string;
}

export interface GrabGenerationSuccess {
  ok: true;
  provider: string;
  model: string;
  generatedAt: string;
  result: GrabResult;
}

export interface GrabGenerationFailure {
  ok: false;
  provider: string;
  model: string;
  generatedAt: string;
  message: string;
}

export type GrabGenerationResult = GrabGenerationSuccess | GrabGenerationFailure;
