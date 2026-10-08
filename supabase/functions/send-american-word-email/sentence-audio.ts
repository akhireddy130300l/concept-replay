// Keep the spoken sentence separate from delivery direction so pronunciation and definitions cannot leak into synthesis.
export function sentenceSpeechRequest(sentence: string) {
  return {
    contents: [{ parts: [
      { text: "Read only the sentence in the next text part. Sound like an adult American man casually chatting with a friend in a movie: relaxed, conversational, natural connected speech and contractions, expressive but not exaggerated. Use normal conversational speed. Do not read these directions, introduce the sentence, say the isolated vocabulary word, explain its meaning, or repeat anything." },
      { text: sentence },
    ] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
    },
  };
}

export const AUDIO_LINK_SECONDS = 365 * 24 * 60 * 60;