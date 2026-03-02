import { Ollama } from "ollama/dist/browser.mjs";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";

export default class OllamaGenerator extends Generator {
	private readonly ollama: Ollama;

	constructor(settings: QuizSettings) {
		super(settings);
		this.ollama = new Ollama({ host: this.settings.ollamaBaseURL });
	}

	public async generateQuiz(contents: string[]): Promise<string> {
		try {
			const response = await this.ollama.generate({
				model: this.settings.ollamaTextGenModel,
				system: this.systemPrompt(),
				prompt: this.userPrompt(contents),
				format: "json",
				stream: false,
			});

			return response.response;
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			// Use OpenAI-compatible API (/v1/embeddings)
			const response = await fetch(`${this.settings.ollamaBaseURL}/v1/embeddings`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.settings.ollamaEmbeddingModel,
					input: [userAnswer, answer],
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("Embedding API error:", response.status, errorText);
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			
			// OpenAI format: { data: [{ embedding: [...] }, { embedding: [...] }] }
			const embeddings = result.data;
			if (!Array.isArray(embeddings) || embeddings.length < 2) {
				console.error("Invalid embedding response:", result);
				throw new Error("Invalid embedding response format");
			}

			const userEmbedding = embeddings[0].embedding;
			const correctEmbedding = embeddings[1].embedding;

			if (!Array.isArray(userEmbedding) || !Array.isArray(correctEmbedding)) {
				console.error("Invalid embedding format:", { userEmbedding, correctEmbedding });
				throw new Error("Invalid embedding format");
			}

			const similarity = cosineSimilarity(userEmbedding, correctEmbedding);
			return similarity;
		} catch (error) {
			console.error("Embedding error:", error);
			// Fallback: return 0 similarity if embedding fails
			return 0;
		}
	}
}
