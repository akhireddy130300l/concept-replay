// Two-voice conversation audio. Directions stay in their own text part so they are never spoken.
export type Line = { speaker: string; line: string };

export const speakerOf = (s: string) => (/^mia/i.test(s.trim()) ? "Mia" : "Jake");

export function conversationSpeechRequest(lines: Line[]) {
  const script = lines.map((l) => `${speakerOf(l.speaker)}: ${l.line}`).join("\n");
  return {
    contents: [{ parts: [
      { text: "Perform only the conversation in the next text part as two American friends casually chatting in a movie scene: relaxed, natural connected speech, contractions, real reactions, normal conversational speed. Do not read these directions, the speaker names, or anything else." },
      { text: script },
    ] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
        { speaker: "Jake", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
        { speaker: "Mia", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      ] } },
    },
  };
}

export function pcmToWav(b64: string): Uint8Array {
  const bin = atob(b64); const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const h = new DataView(new ArrayBuffer(44)); const w = (o: number, t: string) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, 24000, true); h.setUint32(28, 48000, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer)); out.set(pcm, 44); return out;
}
