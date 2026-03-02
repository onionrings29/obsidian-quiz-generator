import { Notice } from "obsidian";

export const enum OpenAITextGenModel {
	GPT_3_5_TURBO = "gpt-3.5-turbo",
	GPT_4_TURBO = "gpt-4-turbo",
	GPT_4o_MINI = "gpt-4o-mini",
	GPT_4o = "gpt-4o",
}

export const openAITextGenModels: Record<OpenAITextGenModel, string> = {
	[OpenAITextGenModel.GPT_3_5_TURBO]: "GPT-3.5 Turbo",
	[OpenAITextGenModel.GPT_4_TURBO]: "GPT-4 Turbo",
	[OpenAITextGenModel.GPT_4o_MINI]: "GPT-4o Mini",
	[OpenAITextGenModel.GPT_4o]: "GPT-4o"
};

export const enum OpenAIEmbeddingModel {
	TEXT_EMBEDDING_3_SMALL = "text-embedding-3-small",
	TEXT_EMBEDDING_3_LARGE = "text-embedding-3-large",
}

export const openAIEmbeddingModels: Record<OpenAIEmbeddingModel, string> = {
	[OpenAIEmbeddingModel.TEXT_EMBEDDING_3_SMALL]: "Text Embedding 3 Small",
	[OpenAIEmbeddingModel.TEXT_EMBEDDING_3_LARGE]: "Text Embedding 3 Large",
};

// Default models to use when fetching fails
const defaultTextGenModels = openAITextGenModels;
const defaultEmbeddingModels = openAIEmbeddingModels;

export const fetchOpenAIModels = async (baseUrl: string, apiKey: string): Promise<Record<string, string>> => {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}

		const response = await fetch(`${baseUrl}/v1/models`, {
			method: "GET",
			headers,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		
		// OpenAI format: { data: [{ id: "model-name", ... }, ...] }
		const models = data.data || [];
		
		return models.reduce((acc: Record<string, string>, model: { id: string }) => {
			acc[model.id] = model.id;
			return acc;
		}, {});
	} catch (error) {
		console.error("Failed to fetch OpenAI models:", error);
		return {};
	}
};

export const getOpenAITextGenModels = async (baseUrl: string, apiKey: string): Promise<Record<string, string>> => {
	const models = await fetchOpenAIModels(baseUrl, apiKey);
	
	// Filter for text generation models (exclude embedding models)
	const textGenModels = Object.fromEntries(
		Object.entries(models).filter(([id]) => !isEmbeddingModel(id))
	);
	
	// If no models found, return defaults
	if (Object.keys(textGenModels).length === 0) {
		return defaultTextGenModels;
	}
	
	return textGenModels;
};

export const getOpenAIEmbeddingModels = async (baseUrl: string, apiKey: string): Promise<Record<string, string>> => {
	const models = await fetchOpenAIModels(baseUrl, apiKey);
	
	// Filter for embedding models
	const embeddingModels = Object.fromEntries(
		Object.entries(models).filter(([id]) => isEmbeddingModel(id))
	);
	
	// If no models found, return defaults
	if (Object.keys(embeddingModels).length === 0) {
		return defaultEmbeddingModels;
	}
	
	return embeddingModels;
};

const isEmbeddingModel = (modelId: string): boolean => {
	const lowerId = modelId.toLowerCase();
	return lowerId.includes("embed") || lowerId.includes("e5") || lowerId.includes("bge-");
};
