import { Notice } from "obsidian";
import OpenAI from "openai";
import Generator from "../generator";
import { QuizSettings } from "../../settings/config";
import { cosineSimilarity } from "../../utils/helpers";

export default class OpenAIGenerator extends Generator {
	private readonly openai: OpenAI;

	constructor(settings: QuizSettings) {
		super(settings);
		this.openai = new OpenAI({
			apiKey: this.settings.openAIApiKey,
			baseURL: this.settings.openAIBaseURL,
			dangerouslyAllowBrowser: true,
		});
	}

	public async generateQuiz(contents: string[]): Promise<string | null> {
		try {
			const response = await this.openai.chat.completions.create({
				model: this.settings.openAITextGenModel,
				messages: [
					{ role: "system", content: this.systemPrompt() },
					{ role: "user", content: this.userPrompt(contents) },
				],
				response_format: { type: "json_object" },
			});

			if (response.choices[0].finish_reason === "length") {
				new Notice("Generation truncated: Token limit reached");
			}

			return response.choices[0].message.content;
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			// Use native fetch for better compatibility with llama.cpp and other OpenAI-compatible servers
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			
			if (this.settings.openAIApiKey) {
				headers["Authorization"] = `Bearer ${this.settings.openAIApiKey}`;
			}

			const response = await fetch(`${this.settings.openAIBaseURL}/v1/embeddings`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					model: this.settings.openAIEmbeddingModel,
					input: [userAnswer, answer],
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("Embedding API error:", response.status, errorText);
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			
			// Validate response format
			if (!result.data || !Array.isArray(result.data) || result.data.length < 2) {
				console.error("Invalid embedding response:", result);
				throw new Error("Invalid embedding response format");
			}

			const embedding1 = result.data[0].embedding;
			const embedding2 = result.data[1].embedding;

			if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
				console.error("Invalid embedding format:", { embedding1, embedding2 });
				throw new Error("Invalid embedding format");
			}

			return cosineSimilarity(embedding1, embedding2);
		} catch (error) {
			console.error("Embedding error:", error);
			throw error;
		}
	}
}
