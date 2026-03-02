import { App, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";

// SM-2 Algorithm intervals (in days)
export enum DifficultyRating {
	AGAIN = 0, // Complete reset, 1 minute
	HARD = 1,  // 1.2x previous interval
	GOOD = 2,  // 2.5x previous interval (default)
	EASY = 3,  // 3.5x previous interval
}

export interface CardSchedule {
	cardId: string; // hash of question text
	easeFactor: number; // Starts at 2.5, min 1.3
	interval: number; // in days
	repetitions: number; // successful review count
	dueDate: number; // timestamp
	lastReviewed: number; // timestamp
}

export interface SpacedRepetitionData {
	schedules: Record<string, CardSchedule>;
	version: number;
}

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;

export class SpacedRepetitionService {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private data: SpacedRepetitionData = { schedules: {}, version: 1 };
	private dataFile: string = ".quiz-generator/sr-data.json";

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Load spaced repetition data from file
	 */
	public async loadData(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(this.dataFile);
			
			if (exists) {
				const content = await adapter.read(this.dataFile);
				this.data = JSON.parse(content);
			}
		} catch (error) {
			console.error("Failed to load spaced repetition data:", error);
			this.data = { schedules: {}, version: 1 };
		}
	}

	/**
	 * Save spaced repetition data to file
	 */
	public async saveData(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const folder = ".quiz-generator";
			
			// Ensure folder exists
			if (!await adapter.exists(folder)) {
				await adapter.mkdir(folder);
			}
			
			await adapter.write(this.dataFile, JSON.stringify(this.data, null, 2));
		} catch (error) {
			console.error("Failed to save spaced repetition data:", error);
		}
	}

	/**
	 * Generate a unique ID for a card based on question text
	 */
	public getCardId(questionText: string): string {
		// Simple hash function
		let hash = 0;
		for (let i = 0; i < questionText.length; i++) {
			const char = questionText.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return `card_${Math.abs(hash)}`;
	}

	/**
	 * Get schedule for a card
	 */
	public getSchedule(cardId: string): CardSchedule | undefined {
		return this.data.schedules[cardId];
	}

	/**
	 * Check if a card is due for review
	 */
	public isDue(cardId: string): boolean {
		const schedule = this.getSchedule(cardId);
		if (!schedule) return true; // New cards are always due
		
		const now = Date.now();
		return schedule.dueDate <= now;
	}

	/**
	 * Get next review date for display
	 */
	public getNextReviewText(rating: DifficultyRating, cardId: string): string {
		const schedule = this.getSchedule(cardId);
		const now = Date.now();
		
		let interval: number;
		let easeFactor: number;
		let repetitions: number;

		if (!schedule) {
			// New card
			easeFactor = DEFAULT_EASE_FACTOR;
			repetitions = 0;
			interval = 0;
		} else {
			easeFactor = schedule.easeFactor;
			repetitions = schedule.repetitions;
			interval = schedule.interval;
		}

		// Calculate new interval based on rating
		let newInterval: number;
		let newRepetitions: number;

		switch (rating) {
			case DifficultyRating.AGAIN:
				newRepetitions = 0;
				newInterval = 1 / 1440; // 1 minute in days
				break;
			case DifficultyRating.HARD:
				newRepetitions = repetitions + 1;
				newInterval = interval * 1.2;
				if (newInterval < 1) newInterval = 1;
				break;
			case DifficultyRating.GOOD:
				newRepetitions = repetitions + 1;
				if (repetitions === 0) {
					newInterval = 1;
				} else if (repetitions === 1) {
					newInterval = 6;
				} else {
					newInterval = interval * easeFactor;
				}
				break;
			case DifficultyRating.EASY:
				newRepetitions = repetitions + 1;
				if (repetitions === 0) {
					newInterval = 4;
				} else if (repetitions === 1) {
					newInterval = 8;
				} else {
					newInterval = interval * (easeFactor + 0.15);
				}
				break;
		}

		// Format the interval for display
		return this.formatInterval(newInterval);
	}

	/**
	 * Process a review rating using SM-2 algorithm
	 */
	public async processReview(cardId: string, questionText: string, rating: DifficultyRating): Promise<void> {
		const now = Date.now();
		const schedule = this.getSchedule(cardId);

		let easeFactor: number;
		let interval: number;
		let repetitions: number;

		if (!schedule) {
			// New card
			easeFactor = DEFAULT_EASE_FACTOR;
			interval = 0;
			repetitions = 0;
		} else {
			easeFactor = schedule.easeFactor;
			interval = schedule.interval;
			repetitions = schedule.repetitions;
		}

		// Apply SM-2 algorithm modifications
		switch (rating) {
			case DifficultyRating.AGAIN:
				repetitions = 0;
				interval = 1 / 1440; // 1 minute in days
				easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2);
				break;
			case DifficultyRating.HARD:
				repetitions += 1;
				if (repetitions === 1) {
					interval = 1;
				} else if (repetitions === 2) {
					interval = 6;
				} else {
					interval = interval * 1.2;
				}
				easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15);
				break;
			case DifficultyRating.GOOD:
				repetitions += 1;
				if (repetitions === 1) {
					interval = 1;
				} else if (repetitions === 2) {
					interval = 6;
				} else {
					interval = interval * easeFactor;
				}
				break;
			case DifficultyRating.EASY:
				repetitions += 1;
				if (repetitions === 1) {
					interval = 4;
				} else if (repetitions === 2) {
					interval = 8;
				} else {
					interval = interval * (easeFactor + 0.3);
				}
				easeFactor += 0.15;
				break;
		}

		// Calculate due date
		const dueDate = now + (interval * 24 * 60 * 60 * 1000);

		// Save schedule
		this.data.schedules[cardId] = {
			cardId,
			easeFactor,
			interval,
			repetitions,
			dueDate,
			lastReviewed: now,
		};

		await this.saveData();
	}

	/**
	 * Format interval for display
	 */
	private formatInterval(days: number): string {
		if (days < 1/1440) {
			return "< 1m";
		} else if (days < 1/60) {
			return `${Math.round(days * 1440)}m`;
		} else if (days < 1) {
			return `${Math.round(days * 24)}h`;
		} else if (days < 30) {
			return `${Math.round(days)}d`;
		} else if (days < 365) {
			return `${Math.round(days / 30)}mo`;
		} else {
			return `${Math.round(days / 365)}y`;
		}
	}

	/**
	 * Get statistics
	 */
	public getStats(): {
		totalCards: number;
		dueCards: number;
		newCards: number;
		learningCards: number;
	} {
		const schedules = Object.values(this.data.schedules);
		const now = Date.now();

		return {
			totalCards: schedules.length,
			dueCards: schedules.filter(s => s.dueDate <= now).length,
			newCards: 0, // Will be calculated by deck reviewer
			learningCards: schedules.filter(s => s.interval < 1 && s.repetitions > 0).length,
		};
	}

	/**
	 * Reset a card's schedule
	 */
	public async resetCard(cardId: string): Promise<void> {
		delete this.data.schedules[cardId];
		await this.saveData();
	}

	/**
	 * Get all due card IDs
	 */
	public getDueCardIds(): string[] {
		const now = Date.now();
		return Object.values(this.data.schedules)
			.filter(s => s.dueDate <= now)
			.map(s => s.cardId);
	}
}
