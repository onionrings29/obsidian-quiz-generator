import { Menu, MenuItem, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, QuizSettings } from "./settings/config";
import SelectorModal from "./ui/selector/selectorModal";
import QuizSettingsTab from "./settings/settings";
import QuizReviewer from "./services/quizReviewer";
import { DeckSelectorModal } from "./ui/deck/deckSelectorModal";
import { DeckReviewer } from "./services/deck/deckReviewer";
import QuizModalLogic from "./ui/quiz/quizModalLogic";

export default class QuizGenerator extends Plugin {
	public settings: QuizSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		this.addCommand({
			id: "open-generator",
			name: "Open generator",
			callback: (): void => {
				new SelectorModal(this.app, this.settings).open();
			}
		});

		this.addRibbonIcon("brain-circuit", "Open generator", (): void => {
			new SelectorModal(this.app, this.settings).open();
		});

		this.addRibbonIcon("library", "Open deck review", (): void => {
			new DeckSelectorModal(this.app, this.settings).open();
		});

		this.addRibbonIcon("repeat", "Review due cards", async (): Promise<void> => {
			const deckReviewer = new DeckReviewer(this.app, this.settings);
			await deckReviewer.initialize();
			const decks = await deckReviewer.scanVault();
			
			// Find all due cards across all decks
			const allDueQuestions: typeof decks[0]['questions'] = [];
			for (const deck of decks) {
				const allQuestions = deckReviewer.getAllQuestionsFromDeck(deck);
				const dueQuestions = allQuestions.filter(q => 
					deckReviewer.getSRService().isDue(deckReviewer.getSRService().getCardId(q.question))
				);
				allDueQuestions.push(...dueQuestions);
			}
			
			if (allDueQuestions.length === 0) {
				new Notice("No cards are due for review!");
				return;
			}
			
			// Convert to Question format and open quiz
			const quizQuestions = allDueQuestions.map(q => {
				const question: any = {
					question: q.question,
					answer: q.answer,
				};
				if (q.options) question.options = q.options;
				if (q.leftOptions) question.leftOptions = q.leftOptions;
				if (q.rightOptions) question.rightOptions = q.rightOptions;
				return question;
			});
			
			await new QuizModalLogic(this.app, this.settings, quizQuestions, [], deckReviewer.getSRService()).renderQuiz();
		});

		this.addCommand({
			id: "open-quiz-from-active-note",
			name: "Open quiz from active note",
			callback: (): void => {
				new QuizReviewer(this.app, this.settings).openQuiz(this.app.workspace.getActiveFile());
			}
		});

		this.addCommand({
			id: "open-deck-review",
			name: "Open deck review",
			callback: (): void => {
				new DeckSelectorModal(this.app, this.settings).open();
			}
		});

		this.addCommand({
			id: "review-due-cards",
			name: "Review due cards",
			callback: async (): Promise<void> => {
				const deckReviewer = new DeckReviewer(this.app, this.settings);
				await deckReviewer.initialize();
				const decks = await deckReviewer.scanVault();
				
				// Find all due cards across all decks
				const allDueQuestions: { question: string; answer: unknown; type: string; options?: string[]; leftOptions?: string[]; rightOptions?: string[] }[] = [];
				for (const deck of decks) {
					const allQuestions = deckReviewer.getAllQuestionsFromDeck(deck);
					const dueQuestions = allQuestions.filter(q => 
						deckReviewer.getSRService().isDue(deckReviewer.getSRService().getCardId(q.question))
					);
					allDueQuestions.push(...dueQuestions);
				}
				
				if (allDueQuestions.length === 0) {
					new Notice("No cards are due for review!");
					return;
				}
				
				// Convert to Question format and open quiz
				const quizQuestions = allDueQuestions.map(q => {
					const question: any = {
						question: q.question,
						answer: q.answer,
					};
					if (q.options) question.options = q.options;
					if (q.leftOptions) question.leftOptions = q.leftOptions;
					if (q.rightOptions) question.rightOptions = q.rightOptions;
					return question;
				});
				
				await new QuizModalLogic(this.app, this.settings, quizQuestions, [], deckReviewer.getSRService()).renderQuiz();
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile): void => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Open quiz from this note")
							.setIcon("scroll-text")
							.onClick((): void => {
								new QuizReviewer(this.app, this.settings).openQuiz(file);
							});
					});
				}
			})
		);

		await this.loadSettings();
		this.addSettingTab(new QuizSettingsTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
