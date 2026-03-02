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

		headerContainer.createEl("p", {
			text: `Found ${this.decks.length} deck(s) with ${totalQuestions} question(s)`,
			cls: "deck-stats"
		});

		// Refresh button
		new Setting(headerContainer)
			.addButton(button =>
				button
					.setButtonText("Refresh")
					.setTooltip("Rescan vault for questions")
					.onClick(async () => {
						this.isLoading = true;
						this.renderLoadingState();
						this.decks = await this.deckReviewer.scanVault();
						this.isLoading = false;
						this.renderDeckList();
					})
			);

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

		const countEl = infoEl.createSpan({
			cls: "deck-item-count",
			text: `(${this.deckReviewer.getDeckQuestionCount(deck)})`
		});

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

		// Add review button directly on the item
		const actionEl = deckEl.createDiv({ cls: "deck-item-action" });
		if (deck.questions.length > 0 || deck.subDecks.length > 0) {
			const reviewBtn = actionEl.createEl("button", {
				text: "Review",
				cls: "deck-review-btn"
			});
			reviewBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.close();
				this.deckReviewer.reviewDeck(deck);
			});
		}
	}
}
