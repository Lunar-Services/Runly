import { z } from "zod";
export const MEDIA_BUCKET = "runly-chat-media";
export const mediaRefSchema = z.object({
  id: z.string().uuid(),
  owner: z.string().uuid(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;
export const mediaManifestSchema = z.object({
  name: z.string().max(180),
  mime: z.string(),
  size: z.number(),
  ready: z.boolean(),
  frames: z.array(z.string()).max(6),
});
export type MediaManifest = z.infer<typeof mediaManifestSchema>;
const prefix = "runly-media:v1\n";
export function mediaPath(project: string, ref: MediaRef) {
  return `${z.string().uuid().parse(project)}/${mediaRefSchema.parse(ref).owner}/${ref.id}`;
}
export function encodeMessage(text: string, media: MediaRef[]) {
  const result = media.length
    ? prefix +
      JSON.stringify({
        text,
        media: z.array(mediaRefSchema).max(4).parse(media),
      })
    : text;
  if (result.length > 12000)
    throw new Error("Your message and attachments are too long.");
  return result;
}
export function decodeMessage(body: string): {
  text: string;
  media: MediaRef[];
} {
  if (body.startsWith(prefix)) {
    try {
      return z
        .object({ text: z.string(), media: z.array(mediaRefSchema).max(4) })
        .parse(JSON.parse(body.slice(prefix.length)));
    } catch {}
  }
  return { text: body, media: [] };
}
export function reservedMessage(text: string) {
  return text.startsWith(prefix);
}
export function combinedUsage(
  usage: { input_tokens: number; output_tokens: number },
  extra: { media_input_tokens?: number; media_output_tokens?: number },
) {
  return {
    ...usage,
    ...extra,
    input_tokens: usage.input_tokens + (extra.media_input_tokens || 0),
    output_tokens: usage.output_tokens + (extra.media_output_tokens || 0),
  };
}
