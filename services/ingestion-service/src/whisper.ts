import OpenAI from 'openai'
import { createReadStream, statSync } from 'node:fs'

const MAX_FILE_BYTES = 25 * 1024 * 1024 // OpenAI Whisper API hard limit

let _client: OpenAI | null = null
function client() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

/**
 * Transcribe an audio or video file via the OpenAI Whisper API.
 * Whisper auto-extracts audio from common containers (mp4, webm, mov).
 */
export async function transcribe(filePath: string): Promise<string> {
  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is ${Math.round(stat.size / 1024 / 1024)}MB; Whisper API max is 25MB.`
    )
  }
  const transcription = await client().audio.transcriptions.create({
    file: createReadStream(filePath),
    model: 'whisper-1',
  })
  return transcription.text
}
