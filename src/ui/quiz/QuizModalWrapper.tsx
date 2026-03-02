import { App } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question } from "../../utils/types";
import QuizModal from "./QuizModal";
import QuizSaver from "../../services/quizSaver";
import { SpacedRepetitionService } from "../../services/spacedRepetition/spacedRepetition";

interface QuizModalWrapperProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	handleClose: () => void;
	srService?: SpacedRepetitionService;
}

const QuizModalWrapper = ({ app, settings, quiz, quizSaver, reviewing, handleClose, srService }: QuizModalWrapperProps) => {
	return <QuizModal
		app={app}
		settings={settings}
		quiz={quiz}
		quizSaver={quizSaver}
		reviewing={reviewing}
		handleClose={handleClose}
		srService={srService}
	/>;
};

export default QuizModalWrapper;
