import { App } from "obsidian";
import { useState } from "react";
import { QuizSettings } from "../../settings/config";
import { Question } from "../../utils/types";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse
} from "../../utils/typeGuards";
import ModalButton from "../components/ModalButton";
import TrueFalseQuestion from "./TrueFalseQuestion";
import MultipleChoiceQuestion from "./MultipleChoiceQuestion";
import SelectAllThatApplyQuestion from "./SelectAllThatApplyQuestion";
import FillInTheBlankQuestion from "./FillInTheBlankQuestion";
import MatchingQuestion from "./MatchingQuestion";
import ShortOrLongAnswerQuestion from "./ShortOrLongAnswerQuestion";
import QuizSaver from "../../services/quizSaver";
import { DifficultyRating, SpacedRepetitionService } from "../../services/spacedRepetition/spacedRepetition";

interface QuizModalProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	handleClose: () => void;
	srService?: SpacedRepetitionService;
}

const QuizModal = ({ app, settings, quiz, quizSaver, reviewing, handleClose, srService }: QuizModalProps) => {
	const [questionIndex, setQuestionIndex] = useState<number>(0);
	const [savedQuestions, setSavedQuestions] = useState<boolean[]>(Array(quiz.length).fill(reviewing));
	const [showAnswer, setShowAnswer] = useState<boolean>(false);
	const [submitted, setSubmitted] = useState<boolean>(false);

	const handlePreviousQuestion = () => {
		if (questionIndex > 0) {
			setQuestionIndex(questionIndex - 1);
		}
	};

	const handleSaveQuestion = async () => {
		const updatedSavedQuestions = [...savedQuestions];
		updatedSavedQuestions[questionIndex] = true;
		setSavedQuestions(updatedSavedQuestions);
		await quizSaver.saveQuestion(quiz[questionIndex]);
	};

	const handleSaveAllQuestions = async () => {
		const unsavedQuestions = quiz.filter((_, index) => !savedQuestions[index]);
		const updatedSavedQuestions = savedQuestions.map(() => true);
		setSavedQuestions(updatedSavedQuestions);
		await quizSaver.saveAllQuestions(unsavedQuestions);
	};

	const handleNextQuestion = () => {
		if (questionIndex < quiz.length - 1) {
			setQuestionIndex(questionIndex + 1);
			setShowAnswer(false);
			setSubmitted(false);
		}
	};

	const handleRateDifficulty = async (rating: DifficultyRating) => {
		if (srService) {
			const currentQuestion = quiz[questionIndex];
			const cardId = srService.getCardId(currentQuestion.question);
			await srService.processReview(cardId, currentQuestion.question, rating);
		}
		setShowAnswer(false);
		handleNextQuestion();
	};

	const handleShowAnswer = () => {
		setShowAnswer(true);
	};

	const getNextReviewText = (rating: DifficultyRating): string => {
		if (!srService) return "";
		const currentQuestion = quiz[questionIndex];
		const cardId = srService.getCardId(currentQuestion.question);
		return srService.getNextReviewText(rating, cardId);
	};

	// Check if current question type requires internal submission (has Submit button)
	const currentQuestionRequiresSubmit = () => {
		const question = quiz[questionIndex];
		return isSelectAllThatApply(question) || isMatching(question);
	};

	const handleQuestionSubmit = () => {
		setSubmitted(true);
	};

	const renderQuestion = () => {
		const question = quiz[questionIndex];
		if (isTrueFalse(question)) {
			return <TrueFalseQuestion key={questionIndex} app={app} question={question} revealAnswer={showAnswer} />;
		} else if (isMultipleChoice(question)) {
			return <MultipleChoiceQuestion key={questionIndex} app={app} question={question} revealAnswer={showAnswer} />;
		} else if (isSelectAllThatApply(question)) {
			return <SelectAllThatApplyQuestion key={questionIndex} app={app} question={question} revealAnswer={showAnswer} onSubmit={handleQuestionSubmit} />;
		} else if (isFillInTheBlank(question)) {
			return <FillInTheBlankQuestion key={questionIndex} app={app} question={question} revealAnswer={showAnswer} onSubmit={handleQuestionSubmit} />;
		} else if (isMatching(question)) {
			return <MatchingQuestion key={questionIndex} app={app} question={question} revealAnswer={showAnswer} onSubmit={handleQuestionSubmit} />;
		} else if (isShortOrLongAnswer(question)) {
			return <ShortOrLongAnswerQuestion key={questionIndex} app={app} question={question} settings={settings} revealAnswer={showAnswer} onSubmit={handleQuestionSubmit} />;
		}
	};

	return (
		<div className="modal-container mod-dim">
			<div className="modal-bg" style={{opacity: 0.85}} onClick={handleClose} />
			<div className="modal modal-qg">
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">Question {questionIndex + 1} of {quiz.length}</div>
				</div>
				<div className="modal-content modal-content-flex-qg">
					<div className="modal-button-container-qg">
						<ModalButton
							icon="arrow-left"
							tooltip="Back"
							onClick={handlePreviousQuestion}
							disabled={questionIndex === 0}
						/>
						<ModalButton
							icon="save"
							tooltip="Save"
							onClick={handleSaveQuestion}
							disabled={savedQuestions[questionIndex]}
						/>
						<ModalButton
							icon="save-all"
							tooltip="Save all"
							onClick={handleSaveAllQuestions}
							disabled={!savedQuestions.includes(false)}
						/>
						<ModalButton
							icon="arrow-right"
							tooltip="Next"
							onClick={handleNextQuestion}
							disabled={questionIndex === quiz.length - 1}
						/>
					</div>
					<hr className="quiz-divider-qg" />
					{renderQuestion()}
					
					{/* Spaced Repetition Controls */}
					{srService && (
						<div className="sr-controls-qg">
							{/* For question types with Submit button, wait for submission before showing rating */}
							{currentQuestionRequiresSubmit() && !submitted ? (
								// Don't show SR controls yet - let user submit their answer first
								<div className="sr-instruction">Submit your answer above, then rate difficulty</div>
							) : !showAnswer ? (
								<button 
									className="sr-show-answer-btn"
									onClick={handleShowAnswer}
								>
									Show Answer
								</button>
							) : (
								<div className="sr-difficulty-buttons">
									<button 
										className="sr-btn sr-btn-again"
										onClick={() => handleRateDifficulty(DifficultyRating.AGAIN)}
									>
										<div className="sr-btn-label">Again</div>
										<div className="sr-btn-interval">{getNextReviewText(DifficultyRating.AGAIN)}</div>
									</button>
									<button 
										className="sr-btn sr-btn-hard"
										onClick={() => handleRateDifficulty(DifficultyRating.HARD)}
									>
										<div className="sr-btn-label">Hard</div>
										<div className="sr-btn-interval">{getNextReviewText(DifficultyRating.HARD)}</div>
									</button>
									<button 
										className="sr-btn sr-btn-good"
										onClick={() => handleRateDifficulty(DifficultyRating.GOOD)}
									>
										<div className="sr-btn-label">Good</div>
										<div className="sr-btn-interval">{getNextReviewText(DifficultyRating.GOOD)}</div>
									</button>
									<button 
										className="sr-btn sr-btn-easy"
										onClick={() => handleRateDifficulty(DifficultyRating.EASY)}
									>
										<div className="sr-btn-label">Easy</div>
										<div className="sr-btn-interval">{getNextReviewText(DifficultyRating.EASY)}</div>
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default QuizModal;
