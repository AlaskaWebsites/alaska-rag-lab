export interface Chunk {
  index: number;
  content: string;
  metadata: {
    charCount: number;
    estimatedTokens: number;
  };
}

export interface ChunkOptions {
  /**
   * Limite aproximado de tokens por chunk (300 a 400 recomendado no Mapa Mental).
   * Estimativa padrão: 1 token ~= 4 caracteres.
   */
  targetTokens?: number;
  /**
   * Sobreposição de tokens entre chunks consecutivos para não perder contexto.
   */
  overlapTokens?: number;
}

/**
 * Chunking semântico baseado em estrutura de documento (parágrafos e cabeçalhos Markdown),
 * evitando quebras no meio de sentenças e preservando a unidade contextual.
 */
export function chunkDocument(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const targetTokens = options.targetTokens ?? 350;
  const overlapTokens = options.overlapTokens ?? 50;

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Separa por parágrafos duplos (preservando fronteiras naturais)
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

        // Aplica overlap pegando o final do buffer anterior
        const overlapText =
          currentBuffer.length > overlapChars
            ? currentBuffer.slice(-overlapChars)
            : currentBuffer;

        currentBuffer = `${overlapText}\n\n${paragraph}`;
      } else {
        // Caso o parágrafo isolado seja maior que targetChars, divide por sentenças
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
