import { Notice, Setting } from "obsidian";
import QuizGenerator from "../../../main";
import { getOpenAIEmbeddingModels, getOpenAITextGenModels } from "../../../generators/openai/openAIModels";
import { DEFAULT_OPENAI_SETTINGS } from "./openAIConfig";

const displayOpenAISettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void): void => {
	new Setting(containerEl)
		.setName("OpenAI API key")
		.setDesc("Enter your OpenAI API key here.")
		.addText(text =>
			text
				.setValue(plugin.settings.openAIApiKey)
				.onChange(async (value) => {
					plugin.settings.openAIApiKey = value.trim();
					await plugin.saveSettings();
				}).inputEl.type = "password"
		);

	new Setting(containerEl)
		.setName("OpenAI API base url")
		.setDesc("Enter your OpenAI API base URL here.")
		.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("rotate-ccw")
				.setTooltip("Restore default")
				.onClick(async () => {
					plugin.settings.openAIBaseURL = DEFAULT_OPENAI_SETTINGS.openAIBaseURL;
					await plugin.saveSettings();
					refreshSettings();
				})
		)
		.addText(text =>
			text
				.setValue(plugin.settings.openAIBaseURL)
				.onChange(async (value) => {
					plugin.settings.openAIBaseURL = value.trim();
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Generation model")
		.setDesc("Model used for quiz generation.")
		.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("refresh-cw")
				.setTooltip("Refresh models")
				.onClick(() => refreshSettings())
		)
		.addDropdown(async (dropdown) => {
			const models = await getOpenAITextGenModels(plugin.settings.openAIBaseURL, plugin.settings.openAIApiKey);
			const noModelsAvailable = Object.keys(models).length === 0;
			if (noModelsAvailable) {
				new Notice("No models found. Check your API key and base URL.");
			}
			dropdown
				.addOptions(models)
				.setValue(plugin.settings.openAITextGenModel)
				.onChange(async (value) => {
					plugin.settings.openAITextGenModel = value;
					await plugin.saveSettings();
				})
				.setDisabled(noModelsAvailable);
		});

	new Setting(containerEl)
		.setName("Embedding model")
		.setDesc("Model used for evaluating short and long answer questions.")
		.addButton(button =>
			button
				.setClass("clickable-icon")
				.setIcon("refresh-cw")
				.setTooltip("Refresh models")
				.onClick(() => refreshSettings())
		)
		.addDropdown(async (dropdown) => {
			const models = await getOpenAIEmbeddingModels(plugin.settings.openAIBaseURL, plugin.settings.openAIApiKey);
			const noModelsAvailable = Object.keys(models).length === 0;
			if (noModelsAvailable) {
				new Notice("No embedding models found. Check your API key and base URL.");
			}
			dropdown
				.addOptions(models)
				.setValue(plugin.settings.openAIEmbeddingModel)
				.onChange(async (value) => {
					plugin.settings.openAIEmbeddingModel = value;
					await plugin.saveSettings();
				})
				.setDisabled(noModelsAvailable);
		});
};

export default displayOpenAISettings;
