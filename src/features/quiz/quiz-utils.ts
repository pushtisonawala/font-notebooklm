export type DifficultyLevel = 1 | 2 | 3;
export type QuestionType = "factual" | "application" | "prerequisite";
export type EmotionState = "neutral" | "confused" | "frustrated" | "engaged";
export type ConfidenceLevel = "low" | "medium" | "high";

export type StudentState = {
  emotionState: EmotionState;
  score: number;
  streak: number;
  wrongStreak: number;
  difficultyLevel: DifficultyLevel;
};

export type ParsedQuizQuestion = {
  prompt: string;
  options: { label: string; text: string }[];
  correctAnswer?: string;
};

export type AdaptiveQuizQuestion = {
  id: string;
  difficulty: DifficultyLevel;
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string;
  prerequisite: string;
  explanation: string;
  sequence: number;
};

export type QuizAttempt = {
  questionId: string;
  questionNumber: number;
  question: string;
  wasCorrect: boolean;
  selectedIndex: number;
  correctIndex: number;
  responseTimeMs: number;
  confidence: ConfidenceLevel;
  emotionAfter: EmotionState;
  difficultyAfter: DifficultyLevel;
  type: QuestionType;
};

export const DEFAULT_STUDENT_STATE: StudentState = {
  emotionState: "neutral",
  score: 0,
  streak: 0,
  wrongStreak: 0,
  difficultyLevel: 1,
};

const APPLICATION_PATTERN =
  /\b(apply|application|scenario|case|best|most likely|would|use|using|example|real-world|situation|analyze|based on)\b/i;
const FOUNDATION_PATTERN =
  /\b(what is|which of the following|identify|define|basic|foundation|core concept|primary|main idea|recall|name)\b/i;

const normalizeQuizContent = (content: string) =>
  content
    .replace(/\s+((?:Question\s*)?\d+[.)]\s+)/gi, "\n$1")
    .replace(/\s+([A-D][).:-]\s+)/g, "\n$1")
    .replace(/\s+(Correct Answer\s*:)/gi, "\n$1")
    .replace(/\s+(Answer\s*:)/gi, "\n$1");

const cleanLine = (value: string) =>
  value
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[-*+]\s*/, "")
    .trim();

const appendText = (current: string, next: string) =>
  current ? `${current} ${next}`.trim() : next.trim();

const clampDifficulty = (value: number): DifficultyLevel => {
  if (value <= 1) {
    return 1;
  }

  if (value >= 3) {
    return 3;
  }

  return value as DifficultyLevel;
};

const shortenPromptFocus = (prompt: string) => {
  const trimmedPrompt = prompt
    .replace(/\?+$/, "")
    .replace(/^(what|which|how|why|when|where)\s+/i, "")
    .trim();

  const words = trimmedPrompt.split(/\s+/).filter(Boolean);
  const preview = words.slice(0, 7).join(" ");

  return preview || "the main concept";
};

const inferDifficulty = (prompt: string, index: number, total: number): DifficultyLevel => {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  let difficulty: DifficultyLevel = ratio < 0.34 ? 1 : ratio < 0.67 ? 2 : 3;

  if (APPLICATION_PATTERN.test(prompt)) {
    difficulty = clampDifficulty(difficulty + 1);
  }

  if (FOUNDATION_PATTERN.test(prompt) && ratio <= 0.5) {
    difficulty = 1;
  }

  return difficulty;
};

const inferQuestionType = (prompt: string, difficulty: DifficultyLevel, index: number): QuestionType => {
  if (APPLICATION_PATTERN.test(prompt) || difficulty === 3) {
    return "application";
  }

  if (difficulty === 1 && (FOUNDATION_PATTERN.test(prompt) || index <= 1)) {
    return "prerequisite";
  }

  return "factual";
};

export const parseQuizQuestions = (content: string): ParsedQuizQuestion[] => {
  const lines = normalizeQuizContent(content).split(/\r?\n/);
  const questions: ParsedQuizQuestion[] = [];
  let currentQuestion: ParsedQuizQuestion | null = null;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);

    if (!line) {
      continue;
    }

    const questionMatch =
      line.match(/^(?:Question\s*)?(\d+)[.)]?\s*(.+)$/i) ||
      line.match(/^Q(?:uestion)?\s*(\d+)\s*:\s*(.+)$/i);

    if (questionMatch && !/^[A-D][).:-]/i.test(questionMatch[2])) {
      if (currentQuestion?.prompt && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
      }

      currentQuestion = {
        prompt: questionMatch[2].trim(),
        options: [],
      };
      continue;
    }

    const optionMatch = line.match(/^([A-D])[).:-]\s*(.+)$/i);
    if (optionMatch && currentQuestion) {
      currentQuestion.options.push({
        label: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim(),
      });
      continue;
    }

    const answerMatch = line.match(/^(?:Correct Answer|Answer)\s*:\s*([A-D])/i);
    if (answerMatch && currentQuestion) {
      currentQuestion.correctAnswer = answerMatch[1].toUpperCase();
      continue;
    }

    if (!currentQuestion) {
      continue;
    }

    if (currentQuestion.options.length === 0) {
      currentQuestion.prompt = appendText(currentQuestion.prompt, line);
      continue;
    }

    const lastOption = currentQuestion.options[currentQuestion.options.length - 1];
    if (lastOption && !currentQuestion.correctAnswer) {
      lastOption.text = appendText(lastOption.text, line);
    }
  }

  if (currentQuestion?.prompt && currentQuestion.options.length > 0) {
    questions.push(currentQuestion);
  }

  return questions;
};

export const buildAdaptiveQuestionBank = (content: string): AdaptiveQuizQuestion[] => {
  const baseQuestions = parseQuizQuestions(content).slice(0, 10);

  return baseQuestions.map((question, index) => {
    const difficulty = inferDifficulty(question.prompt, index, baseQuestions.length);
    const type = inferQuestionType(question.prompt, difficulty, index);
    const correctIndex = Math.max(
      0,
      question.options.findIndex((option) => option.label === question.correctAnswer),
    );
    const focusArea = shortenPromptFocus(question.prompt);
    const optionTexts = question.options.map((option) => option.text);
    const correctOption = optionTexts[correctIndex] || optionTexts[0] || "the strongest option";

    return {
      id: `adaptive-question-${index + 1}`,
      difficulty,
      type,
      question: question.prompt,
      options: optionTexts,
      correctIndex,
      hint: `Look for the answer that most directly connects to ${focusArea}. Eliminate choices that drift into edge cases.`,
      prerequisite: `Before retrying this idea, review the core concept behind ${focusArea} and how it shows up in your notebook sources.`,
      explanation: `The correct answer is "${correctOption}" because it aligns most closely with ${focusArea}.`,
      sequence: index + 1,
    };
  });
};

export const getScorePercentage = (correctCount: number, answeredCount: number) => {
  if (answeredCount <= 0) {
    return 0;
  }

  return Math.round((correctCount / answeredCount) * 100);
};

export const getSlowThresholdMs = (difficulty: DifficultyLevel) => {
  if (difficulty === 1) {
    return 22000;
  }

  if (difficulty === 2) {
    return 26000;
  }

  return 32000;
};

export const getTargetQuestionCount = (questions: AdaptiveQuizQuestion[]) =>
  Math.min(questions.length, 10);

export const pickNextQuestion = ({
  questions,
  askedIds,
  studentState,
}: {
  questions: AdaptiveQuizQuestion[];
  askedIds: Set<string>;
  studentState: StudentState;
}) => {
  const remainingQuestions = questions.filter((question) => !askedIds.has(question.id));

  if (remainingQuestions.length === 0) {
    return null;
  }

  const rankQuestion = (question: AdaptiveQuizQuestion) => {
    let score = 0;
    score -= Math.abs(question.difficulty - studentState.difficultyLevel) * 18;

    if (studentState.emotionState === "engaged") {
      if (question.type === "application") {
        score += 20;
      }

      if (question.difficulty >= studentState.difficultyLevel) {
        score += 16;
      }

      score += question.difficulty * 2;
      return score;
    }

    if (studentState.emotionState === "confused" || studentState.emotionState === "frustrated") {
      if (question.type === "prerequisite") {
        score += 18;
      }

      if (question.type === "factual") {
        score += 10;
      }

      if (question.difficulty <= studentState.difficultyLevel) {
        score += 15;
      }

      score -= question.difficulty * 2;
      return score;
    }

    if (question.difficulty === studentState.difficultyLevel) {
      score += 14;
    }

    if (question.type === "factual") {
      score += 6;
    }

    return score;
  };

  return [...remainingQuestions].sort((firstQuestion, secondQuestion) => {
    const rankDifference = rankQuestion(secondQuestion) - rankQuestion(firstQuestion);

    if (rankDifference !== 0) {
      return rankDifference;
    }

    return firstQuestion.sequence - secondQuestion.sequence;
  })[0];
};

export const deriveStudentState = ({
  previousState,
  isCorrect,
  responseTimeMs,
  difficulty,
  answeredCount,
  correctCount,
  targetQuestionCount,
}: {
  previousState: StudentState;
  isCorrect: boolean;
  responseTimeMs: number;
  difficulty: DifficultyLevel;
  answeredCount: number;
  correctCount: number;
  targetQuestionCount: number;
}) => {
  const streak = isCorrect ? previousState.streak + 1 : 0;
  const wrongStreak = isCorrect ? 0 : previousState.wrongStreak + 1;
  const score = getScorePercentage(correctCount, answeredCount);
  const isSlow = responseTimeMs >= getSlowThresholdMs(difficulty);
  let emotionState: EmotionState = "neutral";
  let difficultyLevel = previousState.difficultyLevel;
  let encouragingMessage: string | undefined;

  if (!isCorrect && isSlow) {
    emotionState = "frustrated";
    difficultyLevel = clampDifficulty(previousState.difficultyLevel - 1);
    encouragingMessage =
      "That one took a bit longer. Let's slow the pace, surface the core concept, and rebuild momentum.";
  } else if (wrongStreak >= 2) {
    emotionState = "confused";
    difficultyLevel = clampDifficulty(previousState.difficultyLevel - 1);
    encouragingMessage =
      "You're close. The next question will ease up a little and unlock a hint to steady the concept.";
  } else if (streak >= 3) {
    emotionState = "engaged";
    difficultyLevel = clampDifficulty(previousState.difficultyLevel + 1);
    encouragingMessage =
      "Strong streak. The next question will lean more applied so you can stretch the idea.";
  }

  if (answeredCount >= Math.ceil(targetQuestionCount / 2) && score > 80) {
    difficultyLevel = 3;

    if (emotionState !== "frustrated") {
      emotionState = "engaged";
    }
  }

  return {
    studentState: {
      emotionState,
      score,
      streak,
      wrongStreak,
      difficultyLevel,
    },
    isSlow,
    encouragingMessage,
  };
};

const formatRangeLabel = (start: number, end: number) =>
  start === end ? `Q${start}` : `Q${start}-Q${end}`;

export const buildEmotionJourneySummary = (attempts: QuizAttempt[]) => {
  if (attempts.length === 0) {
    return "Your emotion timeline will appear here once you answer a few questions.";
  }

  const ranges = attempts.reduce<
    { emotion: EmotionState; start: number; end: number }[]
  >((collection, attempt) => {
    const previousRange = collection[collection.length - 1];

    if (previousRange && previousRange.emotion === attempt.emotionAfter) {
      previousRange.end = attempt.questionNumber;
      return collection;
    }

    collection.push({
      emotion: attempt.emotionAfter,
      start: attempt.questionNumber,
      end: attempt.questionNumber,
    });

    return collection;
  }, []);

  const frustratedRange = ranges.find((range) => range.emotion === "frustrated");
  const confusedRange = ranges.find((range) => range.emotion === "confused");
  const finalRange = ranges[ranges.length - 1];
  const summaryParts: string[] = [];

  if (frustratedRange) {
    summaryParts.push(
      `You hit a frustrated stretch around ${formatRangeLabel(frustratedRange.start, frustratedRange.end)} and slowed down to rebuild the basics.`,
    );
  } else if (confusedRange) {
    summaryParts.push(
      `You felt a little confused around ${formatRangeLabel(confusedRange.start, confusedRange.end)}, then adapted as the quiz simplified the path.`,
    );
  } else {
    summaryParts.push("You stayed pretty steady through the session without a major confidence dip.");
  }

  if (finalRange?.emotion === "engaged") {
    summaryParts.push("You finished in an engaged mode with stronger application-level thinking.");
  } else if (attempts[attempts.length - 1]?.wasCorrect) {
    summaryParts.push("You recovered well by the end and closed with a solid answer.");
  }

  return summaryParts.join(" ");
};
