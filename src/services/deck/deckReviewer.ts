import { App, Notice, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { DeckMode } from "../../settings/general/generalConfig";
import { DifficultyRating, SpacedRepetitionService } from "../spacedRepetition/spacedRepetition";
import {
	FillInTheBlank,
	Matching,
	MultipleChoice,
	Question,
	SelectAllThatApply,
	ShortOrLongAnswer,
	TrueFalse,
} from "../../utils/types";
import QuizModalLogic from "../../ui/quiz/quizModalLogic";

export interface QuestionWithSource {
	question: string;
	answer: boolean | number | number[] | string | string[] | { leftOption: string; rightOption: string }[];
	type: "trueFalse" | "multipleChoice" | "selectAll" | "fillInBlank" | "matching" | "shortAnswer" | "longAnswer";
	sourceFile: string;
	sourcePath: string;
	// Optional properties for specific question types
	options?: string[];
	leftOptions?: string[];
	rightOptions?: string[];
}

export interface Deck {
	id: string;
	name: string;
	path: string;
	questions: QuestionWithSource[];
	subDecks: Deck[];
	parent?: Deck;
	questionCount: number;
}

export class DeckReviewer {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private decks: Deck[] = [];
	private srService: SpacedRepetitionService;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.srService = new SpacedRepetitionService(app, settings);
	}

	/**
	 * Initialize the spaced repetition service
	 */
	public async initialize(): Promise<void> {
		await this.srService.loadData();
	}

	/**
	 * Scan the vault and build decks based on current settings
	 */
	public async scanVault(): Promise<Deck[]> {
		this.decks = [];

		// Get files to scan
		const files = this.getFilesToScan();

		// Parse each file for questions
		const fileQuestions = new Map<string, QuestionWithSource[]>();

		for (const file of files) {
			const questions = await this.parseFileForQuestions(file);
			if (questions.length > 0) {
				fileQuestions.set(file.path, questions);
			}
		}

		// Organize into decks based on deck mode
		switch (this.settings.deckMode) {
			case DeckMode.PER_FILE:
				this.decks = this.buildPerFileDecks(fileQuestions);
				break;
			case DeckMode.ONE_BIG_DECK:
				this.decks = this.buildOneBigDeck(fileQuestions);
				break;
			case DeckMode.FOLDER_BASED:
				this.decks = this.buildFolderBasedDecks(fileQuestions);
				break;
			default:
				this.decks = this.buildPerFileDecks(fileQuestions);
		}

		return this.decks;
	}

	/**
	 * Get all decks (from last scan)
	 */
	public getDecks(): Deck[] {
		return this.decks;
	}

	/**
	 * Flatten deck hierarchy for display
	 */
	public flattenDecks(decks: Deck[] = this.decks, level = 0): { deck: Deck; level: number }[] {
		const result: { deck: Deck; level: number }[] = [];
		for (const deck of decks) {
			result.push({ deck, level });
			result.push(...this.flattenDecks(deck.subDecks, level + 1));
		}
		return result;
	}

	/**
	 * Get all questions from a deck and its sub-decks
	 */
	public getAllQuestionsFromDeck(deck: Deck): QuestionWithSource[] {
		const questions = [...deck.questions];
		for (const subDeck of deck.subDecks) {
			questions.push(...this.getAllQuestionsFromDeck(subDeck));
		}
		return questions;
	}

	/**
	 * Start a review session for a specific deck
	 */
	public async reviewDeck(deck: Deck, dueOnly: boolean = false): Promise<void> {
		let questions = this.getAllQuestionsFromDeck(deck);

		if (dueOnly) {
			// Filter for due cards only
			questions = questions.filter(q => this.srService.isDue(this.srService.getCardId(q.question)));
		}

		if (questions.length === 0) {
			new Notice(`No questions found in deck "${deck.name}"${dueOnly ? " that are due" : ""}`);
			return;
		}

		// Convert to Question format expected by QuizModalLogic
		const quizQuestions: Question[] = questions.map(q => this.convertToQuestion(q));

		// Open quiz modal with spaced repetition enabled
		await new QuizModalLogic(this.app, this.settings, quizQuestions, [], this.srService).renderQuiz();
	}

	/**
	 * Get the spaced repetition service
	 */
	public getSRService(): SpacedRepetitionService {
		return this.srService;
	}

	/**
	 * Get count of due cards in a deck
	 */
	public getDueCount(deck: Deck): number {
		const allQuestions = this.getAllQuestionsFromDeck(deck);
		return allQuestions.filter(q => this.srService.isDue(this.srService.getCardId(q.question))).length;
	}

	/**
	 * Get total question count across all decks
	 */
	public getTotalQuestionCount(): number {
		return this.decks.reduce((sum, deck) => sum + this.getDeckQuestionCount(deck), 0);
	}

	/**
	 * Get question count for a deck including sub-decks
	 */
	public getDeckQuestionCount(deck: Deck): number {
		let count = deck.questions.length;
		for (const subDeck of deck.subDecks) {
			count += this.getDeckQuestionCount(subDeck);
		}
		return count;
	}

	/**
	 * Get files to scan based on settings
	 */
	private getFilesToScan(): TFile[] {
		const allMarkdownFiles = this.app.vault.getMarkdownFiles();

		if (this.settings.scanEntireVault) {
			return allMarkdownFiles;
		}

		// Filter by specified folders
		const folders = this.settings.deckFolders || [];
		if (folders.length === 0) {
			return allMarkdownFiles;
		}

		return allMarkdownFiles.filter(file => {
			return folders.some(folder => {
				const normalizedFolder = folder.endsWith("/") ? folder : `${folder}/`;
				return file.path.startsWith(normalizedFolder) || file.path.startsWith(folder);
			});
		});
	}

	/**
	 * Parse a single file for quiz questions
	 * Uses the same parsers as QuizReviewer
	 */
	private async parseFileForQuestions(file: TFile): Promise<QuestionWithSource[]> {
		const content = await this.app.vault.cachedRead(file);
		const questions: QuestionWithSource[] = [];

		// Parse callout format questions
		this.parseCalloutQuestions(content, file, questions);

		// Parse spaced repetition format questions
		this.parseSpacedRepetitionQuestions(content, file, questions);

		return questions;
	}

	/**
	 * Parse callout format questions from file content
	 */
	private parseCalloutQuestions(content: string, file: TFile, questions: QuestionWithSource[]): void {
		const questionCallout = />\s*\[!question][+-]?\s*(.+)/;
		const answerCallout = />\s*>\s*\[!success].*/;

		const lines = content.split("\n");
		let i = 0;

		while (i < lines.length) {
			const line = lines[i];
			const questionMatch = line.match(questionCallout);

			if (questionMatch) {
				const questionText = questionMatch[1].trim();
				const choices: string[] = [];
				let groupA: string[] = [];
				let groupB: string[] = [];
				let answerText = "";
				let j = i + 1;

				// Parse choices and answer
				while (j < lines.length) {
					const currentLine = lines[j];

					// Check for choice lines
					const choiceMatch = currentLine.match(/>\s*([a-z])\)\s*(.+)/);
					if (choiceMatch) {
						const letter = choiceMatch[1];
						const text = choiceMatch[2].trim();
						choices.push(text);
						if (letter >= "a" && letter <= "m") {
							groupA.push(text);
						} else if (letter >= "n" && letter <= "z") {
							groupB.push(text);
						}
						j++;
						continue;
					}

					// Check for group headers (matching questions)
					const groupMatch = currentLine.match(/>\s*>\s*\[!example].*/);
					if (groupMatch) {
						j++;
						continue;
					}

					// Check for answer callout
					const answerMatch = currentLine.match(answerCallout);
					if (answerMatch) {
						j++;
						if (j < lines.length) {
							const answerContentMatch = lines[j].match(/>\s*>\s*(.+)/);
							if (answerContentMatch) {
								answerText = answerContentMatch[1].trim();
							}
						}
						j++;
						break;
					}

					// Empty line might indicate end of question
					if (currentLine.trim() === "" && choices.length > 0) {
						break;
					}

					j++;
				}

				// Create question based on type
				const question = this.createCalloutQuestion(
					questionText,
					answerText,
					choices,
					groupA,
					groupB,
					file
				);

				if (question) {
					questions.push(question);
				}

				i = j;
			} else {
				i++;
			}
		}
	}

	/**
	 * Create a question from callout format
	 */
	private createCalloutQuestion(
		questionText: string,
		answerText: string,
		choices: string[],
		groupA: string[],
		groupB: string[],
		file: TFile
	): QuestionWithSource | null {
		const baseQuestion = {
			question: questionText,
			sourceFile: file.name,
			sourcePath: file.path,
		};

		// True/False
		if (answerText.toLowerCase() === "true" || answerText.toLowerCase() === "false") {
			return {
				...baseQuestion,
				answer: answerText.toLowerCase() === "true",
				type: "trueFalse" as const,
			};
		}

		// Fill in the Blank
		if (/`_+`/.test(questionText)) {
			const blanks = answerText.split(/,\s+/);
			return {
				...baseQuestion,
				answer: blanks,
				type: "fillInBlank" as const,
			};
		}

		// Matching
		if (groupA.length > 0 && groupB.length > 0) {
			const pairs: { leftOption: string; rightOption: string }[] = [];
			const pairMatches = answerText.match(/([a-m])\)\s*-+>\s*([n-z])\)/g);

			if (pairMatches) {
				for (const pair of pairMatches) {
					const match = pair.match(/([a-m])\)\s*-+>\s*([n-z])\)/);
					if (match) {
						const leftIndex = match[1].charCodeAt(0) - "a".charCodeAt(0);
						const rightIndex = match[2].charCodeAt(0) - "n".charCodeAt(0);
						if (groupA[leftIndex] && groupB[rightIndex]) {
							pairs.push({
								leftOption: groupA[leftIndex],
								rightOption: groupB[rightIndex],
							});
						}
					}
				}
			}

			return {
				...baseQuestion,
				answer: pairs,
				leftOptions: groupA,
				rightOptions: groupB,
				type: "matching" as const,
			};
		}

		// Multiple Choice or Select All
		if (choices.length > 0) {
			const answerMatch = answerText.match(/^([a-z])\)/);
			if (answerMatch) {
				const answerLetter = answerMatch[1];
				const allAnswerLines = answerText.split("\n");
				const answerLetters = allAnswerLines
					.map(line => line.match(/^([a-z])\)/)?.[1])
					.filter(Boolean) as string[];

				if (answerLetters.length > 1) {
					// Select All That Apply
					return {
						...baseQuestion,
						options: choices,
						answer: answerLetters.map(l => l.charCodeAt(0) - "a".charCodeAt(0)),
						type: "selectAll" as const,
					};
				} else {
					// Multiple Choice
					return {
						...baseQuestion,
						options: choices,
						answer: answerLetter.charCodeAt(0) - "a".charCodeAt(0),
						type: "multipleChoice" as const,
					};
				}
			}
		}

		// Short/Long Answer
		if (answerText) {
			// Determine if short or long answer based on length
			const type = answerText.length > 200 ? "longAnswer" as const : "shortAnswer" as const;
			return {
				...baseQuestion,
				answer: answerText,
				type,
			};
		}

		return null;
	}

	/**
	 * Parse spaced repetition format questions from file content
	 */
	private parseSpacedRepetitionQuestions(content: string, file: TFile, questions: QuestionWithSource[]): void {
		const inlineSeparator = this.settings.inlineSeparator || "::";
		const multilineSeparator = this.settings.multilineSeparator || "?";

		const lines = content.split("\n");

		// Parse inline format (question :: answer)
		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const separatorIndex = trimmedLine.indexOf(inlineSeparator);
			if (separatorIndex === -1) continue;

			const questionText = trimmedLine.substring(0, separatorIndex).trim();
			const answerText = trimmedLine.substring(separatorIndex + inlineSeparator.length).trim();

			if (!questionText || !answerText) continue;

			const question = this.parseSpacedRepetitionInline(questionText, answerText, file);
			if (question) {
				questions.push(question);
			}
		}

		// Parse multiline format
		this.parseSpacedRepetitionMultiline(content, multilineSeparator, file, questions);
	}

	/**
	 * Parse inline spaced repetition format
	 */
	private parseSpacedRepetitionInline(
		questionText: string,
		answerText: string,
		file: TFile
	): QuestionWithSource | null {
		const qLower = questionText.toLowerCase();
		const baseQuestion = {
			question: questionText,
			sourceFile: file.name,
			sourcePath: file.path,
		};

		// Remove type prefix if present
		const cleanQuestion = questionText.replace(/^(?:True or False|Fill in the Blank|Short Answer|Long Answer|Matching|Multiple Choice|Select All That Apply):\s*/i, "");

		// True/False
		if (qLower.includes("true or false")) {
			return {
				...baseQuestion,
				question: cleanQuestion,
				answer: answerText.toLowerCase() === "true",
				type: "trueFalse" as const,
			};
		}

		// Fill in the Blank
		if (qLower.includes("fill in the blank") || /`_+`/.test(questionText)) {
			const blanks = answerText.split(/,\s+/);
			return {
				...baseQuestion,
				question: cleanQuestion,
				answer: blanks,
				type: "fillInBlank" as const,
			};
		}

		// Short/Long Answer (default for inline)
		const type = answerText.length > 200 ? "longAnswer" as const : "shortAnswer" as const;
		return {
			...baseQuestion,
			question: cleanQuestion,
			answer: answerText,
			type,
		};
	}

	/**
	 * Parse multiline spaced repetition format
	 */
	private parseSpacedRepetitionMultiline(
		content: string,
		separator: string,
		file: TFile,
		questions: QuestionWithSource[]
	): void {
		const blocks = content.split(new RegExp(`\\n${separator}\\n`, "g"));

		for (let i = 0; i < blocks.length - 1; i++) {
			const questionBlock = blocks[i].trim();
			const answerBlock = blocks[i + 1].trim();

			if (!questionBlock || !answerBlock) continue;

			const lines = questionBlock.split("\n");
			const firstLine = lines[0].trim();

			// Check for type prefix
			const qLower = firstLine.toLowerCase();

			if (qLower.includes("multiple choice")) {
				const question = this.parseMultilineMultipleChoice(questionBlock, answerBlock, file);
				if (question) questions.push(question);
			} else if (qLower.includes("select all")) {
				const question = this.parseMultilineSelectAll(questionBlock, answerBlock, file);
				if (question) questions.push(question);
			} else if (qLower.includes("matching")) {
				const question = this.parseMultilineMatching(questionBlock, answerBlock, file);
				if (question) questions.push(question);
			} else if (qLower.includes("true or false")) {
				const question = this.parseMultilineTrueFalse(questionBlock, answerBlock, file);
				if (question) questions.push(question);
			} else if (qLower.includes("fill in the blank")) {
				const question = this.parseMultilineFillInBlank(questionBlock, answerBlock, file);
				if (question) questions.push(question);
			}
		}
	}

	/**
	 * Parse multiline multiple choice
	 */
	private parseMultilineMultipleChoice(
		questionBlock: string,
		answerBlock: string,
		file: TFile
	): QuestionWithSource | null {
		const lines = questionBlock.split("\n");
		const questionText = lines[0].replace(/^(?:Multiple Choice):\s*/i, "").trim();
		const options: string[] = [];

		for (let i = 1; i < lines.length; i++) {
			const match = lines[i].match(/^[a-z]\)\s*(.+)/);
			if (match) {
				options.push(match[1].trim());
			}
		}

		const answerMatch = answerBlock.match(/^([a-z])\)/);
		if (!answerMatch || options.length === 0) return null;

		return {
			question: questionText,
			options,
			answer: answerMatch[1].charCodeAt(0) - "a".charCodeAt(0),
			type: "multipleChoice",
			sourceFile: file.name,
			sourcePath: file.path,
		};
	}

	/**
	 * Parse multiline select all
	 */
	private parseMultilineSelectAll(
		questionBlock: string,
		answerBlock: string,
		file: TFile
	): QuestionWithSource | null {
		const lines = questionBlock.split("\n");
		const questionText = lines[0].replace(/^(?:Select All That Apply):\s*/i, "").trim();
		const options: string[] = [];

		for (let i = 1; i < lines.length; i++) {
			const match = lines[i].match(/^[a-z]\)\s*(.+)/);
			if (match) {
				options.push(match[1].trim());
			}
		}

		const answerLines = answerBlock.split("\n");
		const answerLetters = answerLines
			.map(line => line.match(/^([a-z])\)/)?.[1])
			.filter(Boolean) as string[];

		if (answerLetters.length === 0 || options.length === 0) return null;

		return {
			question: questionText,
			options,
			answer: answerLetters.map(l => l.charCodeAt(0) - "a".charCodeAt(0)),
			type: "selectAll",
			sourceFile: file.name,
			sourcePath: file.path,
		};
	}

	/**
	 * Parse multiline matching
	 */
	private parseMultilineMatching(
		questionBlock: string,
		answerBlock: string,
		file: TFile
	): QuestionWithSource | null {
		const lines = questionBlock.split("\n");
		const questionText = lines[0].replace(/^(?:Matching):\s*/i, "").trim();

		const leftOptions: string[] = [];
		const rightOptions: string[] = [];
		let inGroupB = false;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.toLowerCase().includes("group a")) continue;
			if (line.toLowerCase().includes("group b")) {
				inGroupB = true;
				continue;
			}

			const match = line.match(/^([a-z])\)\s*(.+)/);
			if (match) {
				const letter = match[1];
				const text = match[2].trim();
				if (letter >= "a" && letter <= "m") {
					leftOptions.push(text);
				} else if (letter >= "n" && letter <= "z") {
					rightOptions.push(text);
				}
			}
		}

		const pairs: { leftOption: string; rightOption: string }[] = [];
		const answerLines = answerBlock.split("\n");

		for (const line of answerLines) {
			const match = line.match(/([a-m])\)\s*-+>\s*([n-z])\)/);
			if (match) {
				const leftIndex = match[1].charCodeAt(0) - "a".charCodeAt(0);
				const rightIndex = match[2].charCodeAt(0) - "n".charCodeAt(0);
				if (leftOptions[leftIndex] && rightOptions[rightIndex]) {
					pairs.push({
						leftOption: leftOptions[leftIndex],
						rightOption: rightOptions[rightIndex],
					});
				}
			}
		}

		if (pairs.length === 0) return null;

		return {
			question: questionText,
			answer: pairs,
			leftOptions,
			rightOptions,
			type: "matching",
			sourceFile: file.name,
			sourcePath: file.path,
		};
	}

	/**
	 * Parse multiline true/false
	 */
	private parseMultilineTrueFalse(
		questionBlock: string,
		answerBlock: string,
		file: TFile
	): QuestionWithSource | null {
		const lines = questionBlock.split("\n");
		const questionText = lines[0].replace(/^(?:True or False):\s*/i, "").trim();

		return {
			question: questionText,
			answer: answerBlock.trim().toLowerCase() === "true",
			type: "trueFalse",
			sourceFile: file.name,
			sourcePath: file.path,
		};
	}

	/**
	 * Parse multiline fill in the blank
	 */
	private parseMultilineFillInBlank(
		questionBlock: string,
		answerBlock: string,
		file: TFile
	): QuestionWithSource | null {
		const lines = questionBlock.split("\n");
		const questionText = lines[0].replace(/^(?:Fill in the Blank):\s*/i, "").trim();
		const blanks = answerBlock.split(/,\s+/);

		return {
			question: questionText,
			answer: blanks,
			type: "fillInBlank",
			sourceFile: file.name,
			sourcePath: file.path,
		};
	}

	/**
	 * Build decks where each file is its own deck
	 */
	private buildPerFileDecks(fileQuestions: Map<string, QuestionWithSource[]>): Deck[] {
		const decks: Deck[] = [];

		for (const [path, questions] of fileQuestions) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) continue;

			const deck: Deck = {
				id: path,
				name: file.basename,
				path,
				questions,
				subDecks: [],
				questionCount: questions.length,
			};

			decks.push(deck);
		}

		return decks;
	}

	/**
	 * Build one big deck with all questions
	 */
	private buildOneBigDeck(fileQuestions: Map<string, QuestionWithSource[]>): Deck[] {
		const allQuestions: QuestionWithSource[] = [];

		for (const questions of fileQuestions.values()) {
			allQuestions.push(...questions);
		}

		const deck: Deck = {
			id: "all",
			name: "All Questions",
			path: "all",
			questions: allQuestions,
			subDecks: [],
			questionCount: allQuestions.length,
		};

		return [deck];
	}

	/**
	 * Build folder-based decks (hierarchy)
	 */
	private buildFolderBasedDecks(fileQuestions: Map<string, QuestionWithSource[]>): Deck[] {
		const deckMap = new Map<string, Deck>();
		const rootDecks: Deck[] = [];

		for (const [path, questions] of fileQuestions) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) continue;

			const folderPath = file.parent?.path || "";
			const folderParts = folderPath.split("/").filter(p => p);

			// Create or get the deck for this file
			const fileDeck: Deck = {
				id: path,
				name: file.basename,
				path,
				questions,
				subDecks: [],
				questionCount: questions.length,
			};

			if (folderParts.length === 0) {
				// File is in root
				rootDecks.push(fileDeck);
			} else {
				// Create folder hierarchy
				let currentPath = "";
				let parentDeck: Deck | undefined;

				for (let i = 0; i < folderParts.length; i++) {
					const part = folderParts[i];
					currentPath = currentPath ? `${currentPath}/${part}` : part;

					let deck = deckMap.get(currentPath);
					if (!deck) {
						deck = {
							id: currentPath,
							name: part,
							path: currentPath,
							questions: [],
							subDecks: [],
							questionCount: 0,
						};
						deckMap.set(currentPath, deck);

						if (parentDeck) {
							parentDeck.subDecks.push(deck);
							deck.parent = parentDeck;
						} else {
							rootDecks.push(deck);
						}
					}

					parentDeck = deck;
				}

				// Add file deck as sub-deck of the last folder
				if (parentDeck) {
					parentDeck.subDecks.push(fileDeck);
					fileDeck.parent = parentDeck;
				} else {
					rootDecks.push(fileDeck);
				}
			}
		}

		// Update question counts
		for (const deck of deckMap.values()) {
			deck.questionCount = this.getDeckQuestionCount(deck);
		}

		return rootDecks;
	}

	/**
	 * Convert QuestionWithSource to Question format for QuizModalLogic
	 */
	private convertToQuestion(q: QuestionWithSource): Question {
		switch (q.type) {
			case "trueFalse":
				return {
					question: q.question,
					answer: q.answer as boolean,
				} as TrueFalse;

			case "multipleChoice":
				return {
					question: q.question,
					options: q.options || [],
					answer: q.answer as number,
				} as MultipleChoice;

			case "selectAll":
				return {
					question: q.question,
					options: q.options || [],
					answer: q.answer as number[],
				} as SelectAllThatApply;

			case "fillInBlank":
				return {
					question: q.question,
					answer: q.answer as string[],
				} as FillInTheBlank;

			case "matching":
				return {
					question: q.question,
					answer: q.answer as { leftOption: string; rightOption: string }[],
				} as Matching;

			case "shortAnswer":
			case "longAnswer":
				return {
					question: q.question,
					answer: q.answer as string,
				} as ShortOrLongAnswer;

			default:
				return {
					question: q.question,
					answer: q.answer as string,
				} as ShortOrLongAnswer;
		}
	}
}
