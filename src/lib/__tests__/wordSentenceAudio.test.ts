import { describe, expect, it } from "vitest";
import { sentenceSpeechRequest } from "../../../supabase/functions/send-american-word-email/sentence-audio";

describe("hourly word sentence audio", () => {
  it("sends the complete example sentence unchanged as the only spoken source", () => {
    const sentence = "That new taco place is legit; you have to try it.";
    const request = sentenceSpeechRequest(sentence);
    const spokenParts = request.contents[0].parts.slice(1);
    expect(spokenParts).toEqual([{ text: sentence }]);
    expect(request.generationConfig.responseModalities).toEqual(["AUDIO"]);
  });
});