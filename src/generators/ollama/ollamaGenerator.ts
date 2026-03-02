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
			// llama.cpp embedding API endpoint
			const response = await fetch(`${this.settings.ollamaBaseURL}/embedding`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					content: userAnswer,
				}),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const userResult = await response.json();
			
			// Get embedding for correct answer
			const correctResponse = await fetch(`${this.settings.ollamaBaseURL}/embedding`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					content: answer,
				}),
			});

			if (!correctResponse.ok) {
				throw new Error(`HTTP error! status: ${correctResponse.status}`);
			}

			const correctResult = await correctResponse.json();

			// llama.cpp returns embedding as an array in the response
			const userEmbedding = userResult.embedding;
			const correctEmbedding = correctResult.embedding;

			if (!Array.isArray(userEmbedding) || !Array.isArray(correctEmbedding)) {
				console.error("Invalid embedding format:", { userResult, correctResult });
				throw new Error("Invalid embedding format from server");
			}

			return cosineSimilarity(userEmbedding, correctEmbedding);
		} catch (error) {
			console.error("Embedding error:", error);
			// Fallback: return 0 similarity if embedding fails
			return 0;
		}
	}
}
