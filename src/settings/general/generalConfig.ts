export const languages: Record<string, string> = {
	English: "English",
	German: "Deutsch",
	Spanish: "Español",
	French: "Français",
	Russian: "Pусский",
	Chinese: "中文",
	Portuguese: "Português",
	Korean: "한국어",
	Japanese: "日本語",
	Arabic: "العربية",
	Danish: "Dansk",
	Norwegian: "Norsk",
	Dutch: "Nederlands",
	Italian: "Italiano",
	Polish: "Polski",
	Hindi: "हिन्दी",
	Vietnamese: "Tiếng Việt",
	Ukrainian: "українська",
	Swedish: "Svenska",
	Persian: "فارسی",
	Greek: "Ελληνικά",
	Indonesian: "Bahasa Indonesia",
};

export enum DeckMode {
	PER_FILE = "per_file",
	ONE_BIG_DECK = "one_big_deck",
	FOLDER_BASED = "folder_based",
}

export const deckModes: Record<DeckMode, string> = {
	[DeckMode.PER_FILE]: "Per File (each note is a deck)",
	[DeckMode.ONE_BIG_DECK]: "One Big Deck (all questions together)",
	[DeckMode.FOLDER_BASED]: "Folder Based (folders as sub-decks)",
};

export interface GeneralConfig {
	showNotePath: boolean;
	showFolderPath: boolean;
	includeSubfolderNotes: boolean;
	randomizeQuestions: boolean;
	language: string;
	// Deck-based review settings
	deckMode: DeckMode;
	deckFolders: string[];
	scanEntireVault: boolean;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralConfig = {
	showNotePath: false,
	showFolderPath: false,
	includeSubfolderNotes: true,
	randomizeQuestions: true,
	language: "English",
	// Deck-based review defaults
	deckMode: DeckMode.PER_FILE,
	deckFolders: [],
	scanEntireVault: true,
};
