import { App, Modal, Setting } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Deck, DeckReviewer } from "../../services/deck/deckReviewer";

export class DeckSelectorModal extends Modal {
	private readonly settings: QuizSettings;
	private deckReviewer: DeckReviewer;
	private decks: Deck[] = [];
	private isLoading = true;
	private selectedDeck: Deck | null = null;

	constructor(app: App, settings: QuizSettings) {
		super(app);
		this.settings = settings;
		this.deckReviewer = new DeckReviewer(app, settings);
		this.modalEl.addClass("quiz-generator-deck-selector");
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText("Deck Review");

		// Show loading state
		this.renderLoadingState();

		// Initialize deck reviewer with spaced repetition
		await this.deckReviewer.initialize();

		// Scan vault for decks
		this.decks = await this.deckReviewer.scanVault();
		this.isLoading = false;

		// Render deck list
		this.renderDeckList();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render loading state
	 */
	private renderLoadingState(): void {
		const { contentEl } = this;
		contentEl.empty();

		const loadingContainer = contentEl.createDiv({ cls: "deck-loading-container" });
		loadingContainer.createEl("p", { text: "Scanning vault for questions..." });
	}

	/**
	 * Render the deck list
	 */
	private renderDeckList(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Header with stats
		const headerContainer = contentEl.createDiv({ cls: "deck-header" });
		const totalQuestions = this.deckReviewer.getTotalQuestionCount();
		
		// Calculate total due across all decks
		let totalDue = 0;
		for (const deck of this.decks) {
			totalDue += this.deckReviewer.getDueCount(deck);
		}
		
		const statsText = totalDue > 0 
			? `Found ${this.decks.length} deck(s) with ${totalDue} due / ${totalQuestions} total`
			: `Found ${this.decks.length} deck(s) with ${totalQuestions} question(s)`;

		headerContainer.createEl("p", {
			text: statsText,
			cls: "deck-stats"
		});

		// Refresh button and Review All Due button
		const headerSetting = new Setting(headerContainer)
			.addButton(button =>
				button
					.setButtonText("Refresh")
					.setTooltip("Rescan vault for questions")
					.onClick(async () => {
						this.isLoading = true;
						this.renderLoadingState();
						await this.deckReviewer.initialize();
						this.decks = await this.deckReviewer.scanVault();
						this.isLoading = false;
						this.renderDeckList();
					})
			);
		
		// Add Review All Due button if there are due cards
		if (totalDue > 0) {
			headerSetting.addButton(button =>
				button
					.setButtonText(`Review All Due (${totalDue})`)
					.setTooltip("Review all due cards across all decks")
					.setCta()
					.onClick(() => {
						this.close();
						// Review all decks with due cards
						const allQuestions = this.deckReviewer.getAllQuestionsFromDeck({
							id: "all",
							name: "All",
							path: "all",
							questions: [],
							subDecks: this.decks,
							questionCount: 0
						}).filter(q => this.deckReviewer.getSRService().isDue(this.deckReviewer.getSRService().getCardId(q.question)));
						
						// Convert and open quiz
						const quizQuestions = allQuestions.map(q => {
							const question: any = {
								question: q.question,
								answer: q.answer,
							};
							if (q.options) question.options = q.options;
							if (q.leftOptions) question.leftOptions = q.leftOptions;
							if (q.rightOptions) question.rightOptions = q.rightOptions;
							return question;
						});
						
						import("../../ui/quiz/quizModalLogic").then(({ default: QuizModalLogic }) => {
							new QuizModalLogic(this.app, this.settings, quizQuestions, [], this.deckReviewer.getSRService()).renderQuiz();
						});
					})
			);
		}

		// Deck list
		const listContainer = contentEl.createDiv({ cls: "deck-list-container" });

		if (this.decks.length === 0) {
			listContainer.createEl("p", {
				text: "No questions found. Make sure your notes contain questions in the supported format.",
				cls: "deck-empty-message"
			});
			return;
		}

		// Flatten decks for display
		const flatDecks = this.deckReviewer.flattenDecks(this.decks);

		for (const { deck, level } of flatDecks) {
			this.renderDeckItem(listContainer, deck, level);
		}

		// Review button (if a deck is selected)
		if (this.selectedDeck) {
			const buttonContainer = contentEl.createDiv({ cls: "deck-button-container" });
			buttonContainer.createEl("button", {
				text: `Review "${this.selectedDeck.name}" (${this.deckReviewer.getDeckQuestionCount(this.selectedDeck)} questions)`,
				cls: "mod-cta"
			}).addEventListener("click", () => {
				this.close();
				this.deckReviewer.reviewDeck(this.selectedDeck!);
			});
		}
	}

	/**
	 * Render a single deck item
	 */
	private renderDeckItem(container: HTMLElement, deck: Deck, level: number): void {
		const deckEl = container.createDiv({
			cls: `deck-item ${this.selectedDeck?.id === deck.id ? "is-selected" : ""}`,
		});

		// Indent based on level
		deckEl.style.paddingLeft = `${level * 20 + 10}px`;

		// Deck info
		const infoEl = deckEl.createDiv({ cls: "deck-item-info" });

		// Icon based on whether it has sub-decks
		const iconEl = infoEl.createSpan({ cls: "deck-item-icon" });
		if (deck.subDecks.length > 0) {
			iconEl.setText("📁");
		} else {
			iconEl.setText("📄");
		}

		// Name and count
		const nameEl = infoEl.createSpan({
			cls: "deck-item-name",
			text: deck.name
		});

		const totalCount = this.deckReviewer.getDeckQuestionCount(deck);
		const dueCount = this.deckReviewer.getDueCount(deck);
		
		const countEl = infoEl.createSpan({
			cls: "deck-item-count",
			text: `(${dueCount} due / ${totalCount} total)`
		});
		
		if (dueCount > 0) {
			countEl.style.color = "var(--color-green)";
			countEl.style.fontWeight = "bold";
		}

		// Click to select
		deckEl.addEventListener("click", () => {
			this.selectedDeck = deck;
			this.renderDeckList();
		});

		// Double click to review immediately
		deckEl.addEventListener("dblclick", () => {
			if (deck.questions.length > 0 || deck.subDecks.length > 0) {
				this.close();
				this.deckReviewer.reviewDeck(deck);
			}
		});

		// Add review buttons directly on the item
		const actionEl = deckEl.createDiv({ cls: "deck-item-action" });
		
		// Review Due button (if there are due cards)
		if (dueCount > 0) {
			const reviewDueBtn = actionEl.createEl("button", {
				text: `Review ${dueCount}`,
				cls: "deck-review-btn deck-review-due-btn"
			});
			reviewDueBtn.style.backgroundColor = "var(--interactive-accent)";
			reviewDueBtn.style.color = "var(--text-on-accent)";
			reviewDueBtn.style.marginRight = "0.5rem";
			reviewDueBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.close();
				this.deckReviewer.reviewDeck(deck, true);
			});
		}
		
		// Review All button
		if (totalCount > 0) {
			const reviewBtn = actionEl.createEl("button", {
				text: "All",
				cls: "deck-review-btn"
			});
			reviewBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.close();
				this.deckReviewer.reviewDeck(deck, false);
			});
		}
	}
}
