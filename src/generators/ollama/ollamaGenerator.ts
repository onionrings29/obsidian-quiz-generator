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
			const response = await this.ollama.embed({
				model: this.settings.ollamaEmbeddingModel,
				input: [userAnswer, answer],
			});

			// Handle different response formats from Ollama
			const embeddings = response.embeddings;
			if (!Array.isArray(embeddings) || embeddings.length < 2) {
				throw new Error("Invalid embedding response from Ollama");
			}

			const userEmbedding = embeddings[0];
			const correctEmbedding = embeddings[1];

			// Ensure embeddings are arrays of numbers
			if (!Array.isArray(userEmbedding) || !Array.isArray(correctEmbedding)) {
				throw new Error("Invalid embedding format from Ollama");
			}

			return cosineSimilarity(userEmbedding, correctEmbedding);
		} catch (error) {
			console.error("Embedding error:", error);
			throw new Error(`Embedding failed: ${(error as Error).message}`);
		}
	}
}
