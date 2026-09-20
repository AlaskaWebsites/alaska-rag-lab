import { env } from '../config/env.js';

export class OllamaService {
  private readonly baseUrl: string;
  private readonly embeddingModel: string;

  constructor() {
    this.baseUrl = env.OLLAMA_BASE_URL;
    this.embeddingModel = env.EMBEDDING_MODEL;
  }

  /**
   * Gera o vetor de embedding para um texto usando o Ollama.
   * Suporta o modelo nomic-embed-text (retornando vetor de 768 dimensões).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Falha ao gerar embedding no Ollama (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as { embedding: number[] };
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Formato inválido de embedding retornado pelo Ollama');
    }

    return data.embedding;
  }
}
