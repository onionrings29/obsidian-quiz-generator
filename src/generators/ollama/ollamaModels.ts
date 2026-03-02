import { Notice } from "obsidian";
import { Ollama } from "ollama/dist/browser.mjs";

export const getOllamaTextGenModels = async (baseUrl: string): Promise<Record<string, string>> => {
	const models = await getOllamaModels(baseUrl);
	return Object.fromEntries(Object.entries(models).filter(([model]) => !isEmbeddingModel(model)));
};

export const getOllamaEmbeddingModels = async (baseUrl: string): Promise<Record<string, string>> => {
	const models = await getOllamaModels(baseUrl);
	return Object.fromEntries(Object.entries(models).filter(([model]) => isEmbeddingModel(model)));
};

const isEmbeddingModel = (modelName: string): boolean => {
	const lowerName = modelName.toLowerCase();
	return lowerName.includes("embed") || lowerName.includes("e5") || lowerName.includes("bge-");
};

const getOllamaModels = async (baseUrl: string): Promise<Record<string, string>> => {
	try {
		const ollama = new Ollama({ host: baseUrl });
		const models = await ollama.list();
		return models.models.reduce((acc, model) => {
			acc[model.name] = model.name;
			return acc;
		}, {} as Record<string, string>);
	} catch (error) {
		new Notice("Error: Ollama not running");
		return {};
	}
};
