import { parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { metaClient } from "./meta";
import { MODELS } from "./env";

export type SegmentObject = {
  id: string;
  box: { left: number; top: number; right: number; bottom: number };
  confidence: number | null;
  /** Raw SAM mask payload; decode with decodeMaskToRaster from @meta-sam/parser. */
  mask: {
    encoding: "lossless" | "one_bit";
    payload: string;
    width: number;
    height: number;
    bounds: { left: number; top: number; right: number; bottom: number };
  } | null;
};

export type SegmentResult = {
  model: string;
  phrase: string;
  objects: SegmentObject[];
  outcome: unknown;
  diagnostics: unknown[];
  raw_output: string;
};

/** Call SAM 3.1 through the Responses API (streaming) and parse its token output. */
export async function segmentImage(dataUrl: string, phrase: string): Promise<SegmentResult> {
  const client = metaClient();
  const stream = await client.responses.create({
    model: MODELS.sam,
    stream: true,
    // SAM-specific options; values are strings per the Meta docs.
    metadata: { mask_encoding: "one_bit", include_confidence: "true" },
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          { type: "input_image", image_url: dataUrl, detail: "auto" },
        ],
      },
    ],
  });

  const parsed = parseImageStream(stream as AsyncIterable<{ type: string }>);
  for await (const snapshot of parsed) void snapshot; // drain; finalResult holds the cumulative view
  const result = await parsed.finalResult;

  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  const latestMask = new Map<string, (typeof masks)[number]>();
  for (const m of masks) {
    const prev = latestMask.get(m.objectId);
    if (!prev || m.revision >= prev.revision) latestMask.set(m.objectId, m);
  }

  const objects: SegmentObject[] = boxes.map((b) => {
    const m = latestMask.get(b.objectId);
    return {
      id: b.objectId,
      box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      confidence: b.confidence ?? m?.confidence ?? null,
      mask: m
        ? {
            encoding: m.mask.encoding,
            payload: m.mask.payload,
            width: m.mask.width,
            height: m.mask.height,
            bounds: { ...m.bounds },
          }
        : null,
    };
  });

  return {
    model: MODELS.sam,
    phrase,
    objects,
    outcome: result.outcome,
    diagnostics: [...result.diagnostics],
    raw_output: result.rawOutput,
  };
}
