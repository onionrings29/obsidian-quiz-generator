import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShortOrLongAnswer } from "../../utils/types";
import { QuizSettings } from "../../settings/config";
import GeneratorFactory from "../../generators/generatorFactory";
import AnswerInput from "../components/AnswerInput";

interface ShortOrLongAnswerQuestionProps {
	app: App;
	question: ShortOrLongAnswer;
	settings: QuizSettings;
	revealAnswer?: boolean;
}

const ShortOrLongAnswerQuestion = ({ app, question, settings, revealAnswer }: ShortOrLongAnswerQuestionProps) => {
	const [status, setStatus] = useState<"answering" | "evaluating" | "submitted">("answering");
	const [result, setResult] = useState<{ similarity: number; isCorrect: boolean } | null>(null);
	
	// Show answer when revealAnswer prop is true
	useEffect(() => {
		if (revealAnswer && status === "answering") {
			setStatus("submitted");
		}
	}, [revealAnswer, status]);

	const component = useMemo<Component>(() => new Component(), []);
	const questionRef = useRef<HTMLDivElement>(null);
	const answerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		question.question.split("\\n").forEach(questionFragment => {
			if (questionRef.current) {
				MarkdownRenderer.render(app, questionFragment, questionRef.current, "", component);
			}
		});
	}, [app, question, component]);

	useEffect(() => {
		if (answerRef.current && status === "submitted") {
			MarkdownRenderer.render(app, question.answer, answerRef.current, "", component);
		}
	}, [app, question, component, status]);

	const handleSubmit = async (input: string) => {
		if (input.toLowerCase().trim() === "skip") {
			setStatus("submitted");
			return;
		}

		try {
			setStatus("evaluating");
			new Notice("Evaluating answer... (this may take 10-20 seconds)", 3000);
			
			const generator = GeneratorFactory.createInstance(settings);
			
			// Add timeout to prevent indefinite hanging
			const timeoutPromise = new Promise<never>((_, reject) => 
				setTimeout(() => reject(new Error("Evaluation timed out (30s). The embedding model may be slow.")), 30000)
			);
			
			const similarity = await Promise.race([
				generator.shortOrLongAnswerSimilarity(input.trim(), question.answer),
				timeoutPromise
			]);
			
			const similarityPercentage = Math.round(similarity * 100);
			const isCorrect = similarityPercentage >= 80;
			
			setResult({ similarity: similarityPercentage, isCorrect });
			
			if (isCorrect) {
				new Notice(`✓ Correct! ${similarityPercentage}% match`, 5000);
			} else {
				new Notice(`✗ Incorrect. ${similarityPercentage}% match`, 5000);
			}
			
			setStatus("submitted");
		} catch (error) {
			console.error("Evaluation error:", error);
			setStatus("answering");
			new Notice(`Error: ${(error as Error).message}`, 5000);
		}
	};

	const getResultClass = () => {
		if (!result) return "";
		return result.isCorrect ? "sr-result-correct" : "sr-result-incorrect";
	};

	const getResultText = () => {
		if (!result) return "";
		return result.isCorrect ? `✓ Correct (${result.similarity}% match)` : `✗ Incorrect (${result.similarity}% match)`;
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			
			{/* Show evaluation result */}
			{result && (
				<div className={`sr-result ${getResultClass()}`}>
					{getResultText()}
				</div>
			)}
			
			{/* Show correct answer */}
			{status === "submitted" && (
				<div className="answer-container-qg">
					<div className="answer-label-qg">Correct Answer:</div>
					<div className="answer-qg" ref={answerRef} />
				</div>
			)}
			
			<div className={status === "submitted" ? "input-container-qg" : "input-container-qg limit-height-qg"}>
				<AnswerInput 
					onSubmit={handleSubmit} 
					clearInputOnSubmit={false} 
					disabled={status !== "answering"} 
				/>
				<div className="instruction-footnote-qg">
					{status === "evaluating" 
						? "Evaluating... (may take 10-20s with slow embedding models)" 
						: 'Press enter to submit your answer. Enter "skip" to reveal the answer.'}
				</div>
			</div>
		</div>
	);
};

export default ShortOrLongAnswerQuestion;
