import { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3;
const BASE_DELAY = 2000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getSystemInstruction = (maxLineLength: number, isHardLimit: boolean) => {
  const lengthConstraint = isHardLimit
    ? `STRICTLY limit each line to a maximum of ${maxLineLength} characters. Break lines that exceed this limit.`
    : `Target a maximum line length of approximately ${maxLineLength} characters. You may exceed this slightly if splitting the line would break a clear lyrical phrase or logic, but avoid joining unrelated lines just to meet the length .`;

  return `
You are an expert transcriptionist and lyric synchronizer. 
Your task is to listen to the provided audio file and generate a standard LRC (Lyric) file format output.

CRITICAL TIMING INSTRUCTION:
- **Start of First Word**: Timestamps must correspond to the EXACT start of the first word in the line.
- **Phoneme-Level Accuracy**: Listen for the first consonant or vowel onset of the word. Do not include the breath before it.
- **Latency Correction**: Common outputs are often delayed. You MUST anticipate the beat. Timestamp the 'attack' of the sound. It is better to be slightly early (50-100ms) than late.

Rules:
1. **Transcribe Exactly**: Output the lyrics in lrc format
   - Use the provided lyrics as the ground truth, unless certain heard words differ
   - Provide timestamps for every line of lyrics in the format instructed, ensuring accuracy as per CRITICAL TIMING INSTRUCTIONS
2. **Line Structure**: 
   - ${lengthConstraint}
   - Break lines at natural pauses (breath points) to keep synchronization tight.
   - Do not bundle multiple fast-paced sentences into one long line; split them so each has a fresh timestamp.
3. **Format**:
   - Return ONLY the LRC data. No markdown blocks, no intro text, no headers/footers, no block formatting  (like \`\`\`)
   - The output must be pure text, ready to be saved as a .lrc file.
   - Provide a timestamp for every single line of lyrics in the format [mm:ss.xx].
   - Timestamps must be relative to the start of the audio file.
   - If there is an instrumental section, mark it as [mm:ss.xx] (Instrumental) if significent (longer than 10s).

Example Output:
[00:12.50] This is the first line
[00:15.20] Here comes the second line
[00:18.90] And the chorus drops now
`;
};

const getApiKey = (): string | undefined => {
  // Prioritize local storage key if available (for Vercel/manual deployments)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) return stored;
  }
  // Fallback to env var (for AI Studio or pre-configured envs)
  return process.env.API_KEY;
};

export const generateLrcFromAudio = async (
  base64Audio: string, 
  mimeType: string, 
  referenceLyrics?: string,
  maxLineLength: number = 30,
  isHardLimit: boolean = false
): Promise<string> => {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API Key is missing. Please set it via the 'Set API Key' button or configure your environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  let promptText = "Generate a synchronized LRC file for this audio.";
  if (referenceLyrics && referenceLyrics.trim().length > 0) {
    promptText += `\n\nInstructions for Lyrics:\nUse the following text as the GROUND TRUTH for the lyrics content. Do not hallucinate new words. Your primary job is to synchronize these exact lyrics to the audio. If the provided lyrics differ significantly from the audio, prefer the audio but try to match the provided text structure where possible, while respecting line length limits.\n\nReference Lyrics:\n${referenceLyrics}`;
  }

  let lastError: any;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio
              }
            },
            {
              text: promptText
            }
          ]
        },
        config: {
          systemInstruction: getSystemInstruction(maxLineLength, isHardLimit),
          temperature: 0.3,
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No text generated from the model.");
      }

      // Clean up potential markdown blocks if the model ignores instructions slightly
      let cleanText = text.trim();
      if (cleanText.startsWith("```lrc")) {
        cleanText = cleanText.replace(/^```lrc/, "").replace(/```$/, "");
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```/, "").replace(/```$/, "");
      }

      return cleanText.trim();

    } catch (error: any) {
      lastError = error;
      console.warn(`Gemini API Attempt ${attempt + 1} failed:`, error);
      
      // Determine if error is terminal (Client Errors: 400, 401, 403, 404)
      // 429 Too Many Requests is NOT terminal, we should retry.
      const status = error.status || error.response?.status;
      const isTerminal = status === 400 || status === 401 || status === 403 || status === 404;

      if (attempt === MAX_RETRIES || isTerminal) {
        break; // Exit loop to throw error
      }

      // Exponential backoff with jitter
      const delay = BASE_DELAY * Math.pow(2, attempt) + (Math.random() * 1000);
      console.log(`Retrying in ${Math.round(delay)}ms...`);
      await wait(delay);
    }
  }

  console.error("Gemini API Error after retries:", lastError);
  throw lastError || new Error("Failed to generate content after multiple attempts.");
};
