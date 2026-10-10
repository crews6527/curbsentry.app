export type Crop = { x: number; y: number; width: number; height: number };
export type PlateCandidate = {
  plate: string;
  confidence: number;
  offsetSeconds: number;
};
export const FULL_FRAME: Crop = { x: 0, y: 0, width: 100, height: 100 };

export function validateCapture(at: number, now = Date.now()): number {
  if (!Number.isFinite(at) || at < Date.UTC(2000, 0, 1) || at > now + 300_000)
    throw new Error("Enter the recording start time, between 2000 and now.");
  return at;
}

export function validateCrop(crop: Crop): Crop {
  const { x, y, width, height } = crop;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > 100 ||
    y + height > 100
  )
    throw new Error(
      "The scan area must fit inside the frame (0 to 100 percent).",
    );
  return crop;
}

export function sampleOffsets(duration: number, maxFrames = 60): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
    throw new Error("Choose a video of at most ten minutes.");
  const count = Math.min(maxFrames, Math.max(1, Math.ceil(duration)));
  return Array.from({ length: count }, (_, i) =>
    Math.min(duration - 0.001, ((i + 0.5) * duration) / count),
  );
}

type Word = {
  text: string;
  confidence: number;
  left: number;
  width: number;
  height: number;
};
// TSV confidence belongs to the word, not to the whole frame. Nearby words on
// the same OCR line can be a plate separated by a space ("ABC 1234").
export function candidatesFromTsv(
  tsv: string,
  offsetSeconds: number,
): PlateCandidate[] {
  const lines = tsv.trim().split(/\r?\n/);
  // Tesseract.js returns headerless TSV; the native CLI includes a header.
  const header = lines[0]?.startsWith("level\t")
    ? lines.shift()!.split("\t")
    : [
        "level",
        "page_num",
        "block_num",
        "par_num",
        "line_num",
        "word_num",
        "left",
        "top",
        "width",
        "height",
        "conf",
        "text",
      ];
  const index = (name: string) => header.indexOf(name);
  const groups = new Map<string, Word[]>();
  for (const line of lines) {
    const values = line.split("\t");
    if (values[index("level")] !== "5") continue;
    const raw = values[index("text")] ?? "";
    // Punctuation-only fields and timestamp tokens must not become a plate.
    if (!/^[A-Za-z0-9 -]+$/.test(raw) || !/[A-Za-z0-9]/.test(raw)) continue;
    const confidence = Number(values[index("conf")]);
    if (!Number.isFinite(confidence) || confidence < 65) continue;
    const key = ["page_num", "block_num", "par_num", "line_num"]
      .map((n) => values[index(n)])
      .join(":");
    const word = {
      text: raw.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      confidence,
      left: Number(values[index("left")]),
      width: Number(values[index("width")]),
      height: Number(values[index("height")]),
    };
    if (![word.left, word.width, word.height].every(Number.isFinite)) continue;
    const group = groups.get(key) ?? [];
    group.push(word);
    groups.set(key, group);
  }
  const found = new Map<string, PlateCandidate>();
  for (const words of groups.values()) {
    words.sort((a, b) => a.left - b.left);
    for (let i = 0; i < words.length; i++) {
      let plate = "";
      let confidence = 100;
      for (let j = i; j < Math.min(i + 3, words.length); j++) {
        if (
          j > i &&
          words[j].left - words[j - 1].left - words[j - 1].width >
            Math.max(words[j].height, words[j - 1].height) * 1.5
        )
          break;
        plate += words[j].text;
        confidence = Math.min(confidence, words[j].confidence);
        if (plate.length > 8) break;
        if (
          /^[A-Z0-9]{4,8}$/.test(plate) &&
          /[A-Z]/.test(plate) &&
          /\d/.test(plate)
        ) {
          const old = found.get(plate);
          if (!old || old.confidence < confidence)
            found.set(plate, { plate, confidence, offsetSeconds });
        }
      }
    }
  }
  return [...found.values()].slice(0, 100);
}
