import { Setting } from "obsidian";
import QuizGenerator from "../../main";
import { deckModes, DeckMode, languages } from "./generalConfig";

const displayGeneralSettings = (containerEl: HTMLElement, plugin: QuizGenerator, refreshSettings: () => void): void => {
	new Setting(containerEl)
		.setName("Show note path")
		.setDesc("Turn this off to only show the name of selected notes.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showNotePath)
				.onChange(async (value) => {
					plugin.settings.showNotePath = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Show folder path")
		.setDesc("Turn this off to only show the name of selected folders.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.showFolderPath)
				.onChange(async (value) => {
					plugin.settings.showFolderPath = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Include notes in subfolders")
		.setDesc("Turn this off to only include notes in the selected folders.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.includeSubfolderNotes)
				.onChange(async (value) => {
					plugin.settings.includeSubfolderNotes = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Randomize question order")
		.setDesc("Turn this off to answer questions in their generated/saved order.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.randomizeQuestions)
				.onChange(async (value) => {
					plugin.settings.randomizeQuestions = value;
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName("Language")
		.setDesc("Language questions are generated in.")
		.addDropdown(dropdown =>
			dropdown
				.addOptions(languages)
				.setValue(plugin.settings.language)
				.onChange(async (value: string) => {
					plugin.settings.language = value;
					await plugin.saveSettings();
				})
		);

	// Deck-based review settings
	containerEl.createEl("h3", { text: "Deck Review" });

	new Setting(containerEl)
		.setName("Deck mode")
		.setDesc("How to organize questions into decks.")
		.addDropdown(dropdown =>
			dropdown
				.addOptions(deckModes)
				.setValue(plugin.settings.deckMode)
				.onChange(async (value: string) => {
					plugin.settings.deckMode = value as DeckMode;
					await plugin.saveSettings();
					refreshSettings();
				})
		);

	new Setting(containerEl)
		.setName("Scan entire vault")
		.setDesc("If enabled, all notes in the vault will be scanned for inline questions. If disabled, only notes in the folders below will be scanned.")
		.addToggle(toggle =>
			toggle
				.setValue(plugin.settings.scanEntireVault)
				.onChange(async (value) => {
					plugin.settings.scanEntireVault = value;
					await plugin.saveSettings();
					refreshSettings();
				})
		);

	if (!plugin.settings.scanEntireVault) {
		new Setting(containerEl)
			.setName("Deck folders")
			.setDesc("Comma-separated list of folder paths to scan for inline questions.")
			.addText(text =>
				text
					.setPlaceholder("e.g., Notes,Study,Reviews")
					.setValue(plugin.settings.deckFolders?.join(",") || "")
					.onChange(async (value) => {
						plugin.settings.deckFolders = value.split(",").map(f => f.trim()).filter(f => f);
						await plugin.saveSettings();
					})
			);
	}
};

export default displayGeneralSettings;
