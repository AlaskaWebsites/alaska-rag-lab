export interface Chunk {
  index: number;
  content: string;
  metadata: {
    charCount: number;
    estimatedTokens: number;
  };
}

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const targetTokens = options.targetTokens ?? 350;
  const overlapTokens = options.overlapTokens ?? 50;

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let currentBuffer = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    if ((currentBuffer + '\n\n' + paragraph).length <= targetChars) {
      currentBuffer = currentBuffer ? `${currentBuffer}\n\n${paragraph}` : paragraph;
    } else {
      if (currentBuffer) {
        chunks.push({
          index: chunkIndex++,
          content: currentBuffer,
          metadata: {
            charCount: currentBuffer.length,
            estimatedTokens: Math.round(currentBuffer.length / 4),
          },
        });

        const overlapText =
          currentBuffer.length > overlapChars
            ? currentBuffer.slice(-overlapChars)
            : currentBuffer;

        currentBuffer = `${overlapText}\n\n${paragraph}`;
      } else {
        currentBuffer = paragraph;
      }
    }
  }

  if (currentBuffer.trim().length > 0) {
    chunks.push({
      index: chunkIndex++,
      content: currentBuffer.trim(),
      metadata: {
        charCount: currentBuffer.trim().length,
        estimatedTokens: Math.round(currentBuffer.trim().length / 4),
      },
    });
  }

  return chunks;
}
