import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  Camera,
  CameraOff,
  ChevronRight,
  CircleGauge,
  Lightbulb,
  RefreshCcw,
  Rocket,
  ScanFace,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useSelector } from "react-redux";
import type {
  Category as MediaPipeCategory,
  Classifications,
  FaceLandmarker as MediaPipeFaceLandmarker,
} from "@mediapipe/tasks-vision";

import { getChatHistory } from "@/api/chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RootState } from "@/store";
import {
  buildAdaptiveQuestionBank,
  buildEmotionJourneySummary,
  DEFAULT_STUDENT_STATE,
  deriveStudentState,
  getScorePercentage,
  getTargetQuestionCount,
  parseQuizQuestions,
  pickNextQuestion,
  type AdaptiveQuizQuestion,
  type ConfidenceLevel,
  type EmotionState,
  type QuizAttempt,
  type StudentState,
} from "@/features/quiz/quiz-utils";

type QuizLaunchState = {
  noteId?: string;
  quizContent?: string;
};

type SelectedSource = {
  noteId?: string;
  originalName?: string;
  filename?: string;
};

type FeedbackState = {
  selectedIndex: number;
  wasCorrect: boolean;
  responseTimeMs: number;
  nextEmotion: EmotionState;
  showHint: boolean;
  showPrerequisite: boolean;
  encouragingMessage?: string;
};

type CameraPermissionState =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unsupported";

type CameraSignalState = {
  permission: CameraPermissionState;
  detectorMode: "mediapipe" | "face-detector" | "webcam-only" | "unsupported";
  faceVisible: boolean;
  attentionScore: number;
  expressionSignal: EmotionState | null;
  statusMessage: string;
  samples: number;
};

type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CameraHistorySample = {
  visible: boolean;
  motion: number;
  focus: number;
  engaged: number;
  confused: number;
  frustrated: number;
};

type FaceDetectorResult = {
  boundingBox?: FaceBox;
};

type BrowserFaceDetector = {
  detect: (input: HTMLVideoElement) => Promise<FaceDetectorResult[]>;
};

type BrowserFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => BrowserFaceDetector;

declare global {
  interface Window {
    FaceDetector?: BrowserFaceDetectorConstructor;
  }
}

const CONFIDENCE_OPTIONS: {
  level: ConfidenceLevel;
  emoji: string;
  label: string;
  helper: string;
}[] = [
  {
    level: "low",
    emoji: "😅",
    label: "Need a hint",
    helper: "Unsure and narrowing it down.",
  },
  {
    level: "medium",
    emoji: "🙂",
    label: "Pretty okay",
    helper: "I can reason this out.",
  },
  {
    level: "high",
    emoji: "😎",
    label: "Locked in",
    helper: "I know why this is right.",
  },
];

const emotionMeta: Record<
  EmotionState,
  { label: string; accent: string; panel: string; helper: string }
> = {
  neutral: {
    label: "Steady",
    accent: "text-slate-100",
    panel: "border-white/10 bg-white/[0.06]",
    helper: "The system is keeping things balanced.",
  },
  confused: {
    label: "Confused",
    accent: "text-sky-200",
    panel: "border-sky-400/30 bg-sky-500/10",
    helper: "Hints unlock and the next question gets gentler.",
  },
  frustrated: {
    label: "Frustrated",
    accent: "text-amber-200",
    panel: "border-amber-400/30 bg-amber-500/10",
    helper: "The quiz slows down and surfaces prerequisite ideas.",
  },
  engaged: {
    label: "Engaged",
    accent: "text-fuchsia-200",
    panel: "border-fuchsia-400/30 bg-fuchsia-500/10",
    helper: "Harder, more applied questions start showing up.",
  },
};

const difficultyMeta = {
  1: {
    label: "Easy",
    helper: "Foundation check",
    glow: "from-sky-400/50 via-cyan-400/35 to-transparent",
  },
  2: {
    label: "Medium",
    helper: "Reasoning build",
    glow: "from-violet-400/45 via-fuchsia-400/30 to-transparent",
  },
  3: {
    label: "Hard",
    helper: "Application push",
    glow: "from-fuchsia-500/50 via-indigo-400/35 to-transparent",
  },
} as const;

const typeLabels = {
  factual: "Factual",
  application: "Application",
  prerequisite: "Prerequisite",
} as const;

const DEFAULT_CAMERA_SIGNAL: CameraSignalState = {
  permission: "idle",
  detectorMode: "unsupported",
  faceVisible: false,
  attentionScore: 0,
  expressionSignal: null,
  statusMessage:
    "Camera is off. Enable webcam access so the quiz can mix visual focus cues into the emotion engine.",
  samples: 0,
};

const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MEDIAPIPE_FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const getBlendshapeScore = (
  categories: MediaPipeCategory[],
  names: string[],
  fallback = 0,
) => {
  if (categories.length === 0 || names.length === 0) {
    return fallback;
  }

  const matchedScores = names
    .map((name) => categories.find((category) => category.categoryName === name)?.score)
    .filter((score): score is number => typeof score === "number");

  if (matchedScores.length === 0) {
    return fallback;
  }

  return matchedScores.reduce((sum, score) => sum + score, 0) / matchedScores.length;
};

const analyzeBlendshapes = (blendshapes: Classifications[] = []) => {
  const categories = blendshapes[0]?.categories ?? [];
  const smile = getBlendshapeScore(categories, ["mouthSmileLeft", "mouthSmileRight"]);
  const frown = getBlendshapeScore(categories, [
    "mouthFrownLeft",
    "mouthFrownRight",
    "mouthPressLeft",
    "mouthPressRight",
  ]);
  const browDown = getBlendshapeScore(categories, ["browDownLeft", "browDownRight"]);
  const browUp = getBlendshapeScore(categories, [
    "browInnerUp",
    "browOuterUpLeft",
    "browOuterUpRight",
  ]);
  const blink = getBlendshapeScore(categories, ["eyeBlinkLeft", "eyeBlinkRight"]);
  const squint = getBlendshapeScore(categories, [
    "eyeSquintLeft",
    "eyeSquintRight",
    "cheekSquintLeft",
    "cheekSquintRight",
  ]);
  const eyeWide = getBlendshapeScore(categories, ["eyeWideLeft", "eyeWideRight"]);
  const jawOpen = getBlendshapeScore(categories, ["jawOpen"]);
  const pucker = getBlendshapeScore(categories, ["mouthPucker", "mouthFunnel"]);

  const confused = clampUnit(
    browUp * 0.42 + pucker * 0.24 + jawOpen * 0.14 + blink * 0.08 + squint * 0.12,
  );
  const frustrated = clampUnit(
    frown * 0.4 + browDown * 0.24 + squint * 0.2 + blink * 0.08 + jawOpen * 0.08,
  );
  const engaged = clampUnit(
    (1 - blink) * 0.22 +
      eyeWide * 0.24 +
      smile * 0.14 +
      (1 - frown) * 0.16 +
      (1 - pucker) * 0.1 +
      (1 - browDown) * 0.14,
  );
  const focus = clampUnit(0.55 + engaged * 0.28 - confused * 0.22 - frustrated * 0.3);

  return {
    focus,
    engaged,
    confused,
    frustrated,
  };
};

const clampDifficultyLevel = (value: number): StudentState["difficultyLevel"] => {
  if (value <= 1) {
    return 1;
  }

  if (value >= 3) {
    return 3;
  }

  return value as StudentState["difficultyLevel"];
};

const blendCameraEmotion = ({
  baseState,
  wasCorrect,
  confidence,
  cameraSignal,
}: {
  baseState: StudentState;
  wasCorrect: boolean;
  confidence: ConfidenceLevel;
  cameraSignal: CameraSignalState;
}) => {
  if (cameraSignal.permission !== "granted" || !cameraSignal.expressionSignal) {
    return {
      studentState: baseState,
      cameraMessage: undefined as string | undefined,
    };
  }

  if ((!cameraSignal.faceVisible || cameraSignal.expressionSignal === "frustrated") && !wasCorrect) {
    return {
      studentState: {
        ...baseState,
        emotionState: "frustrated",
        difficultyLevel: clampDifficultyLevel(baseState.difficultyLevel - 1),
      },
      cameraMessage:
        "The webcam lost a steady focus signal, so the next question will ease up and surface prerequisite support.",
    };
  }

  if (
    cameraSignal.expressionSignal === "confused" &&
    (!wasCorrect || confidence === "low") &&
    baseState.emotionState !== "frustrated"
  ) {
    return {
      studentState: {
        ...baseState,
        emotionState: "confused",
        difficultyLevel: clampDifficultyLevel(baseState.difficultyLevel - 1),
      },
      cameraMessage:
        "Camera cues suggested uncertainty, so hints stay unlocked and the next prompt will simplify.",
    };
  }

  if (
    cameraSignal.expressionSignal === "engaged" &&
    (wasCorrect || confidence === "high") &&
    baseState.emotionState !== "frustrated"
  ) {
    return {
      studentState: {
        ...baseState,
        emotionState: "engaged",
        difficultyLevel: clampDifficultyLevel(baseState.difficultyLevel + 1),
      },
      cameraMessage:
        "The webcam is seeing steady focus, so the quiz is ready to push toward a harder application question.",
    };
  }

  return {
    studentState: baseState,
    cameraMessage: undefined as string | undefined,
  };
};

const buildFreshSession = (questions: AdaptiveQuizQuestion[]) => {
  const firstQuestion = pickNextQuestion({
    questions,
    askedIds: new Set<string>(),
    studentState: DEFAULT_STUDENT_STATE,
  });

  return {
    studentState: DEFAULT_STUDENT_STATE,
    askedIds: [] as string[],
    attempts: [] as QuizAttempt[],
    feedback: null as FeedbackState | null,
    confidenceMap: {} as Record<string, ConfidenceLevel>,
    currentQuestionId: firstQuestion?.id ?? null,
    questionStartedAt: Date.now(),
    elapsedMs: 0,
    hintVisible: false,
  };
};

const formatResponseTime = (responseTimeMs: number) =>
  `${(responseTimeMs / 1000).toFixed(1)}s`;

const formatAverageTime = (attempts: QuizAttempt[]) => {
  if (attempts.length === 0) {
    return "0.0s";
  }

  const totalTime = attempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0);
  return formatResponseTime(totalTime / attempts.length);
};

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedFiles = useSelector(
    (state: RootState) => state.chat.selectedFiles as SelectedSource[],
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorIntervalRef = useRef<number | null>(null);
  const analysisPendingRef = useRef(false);
  const faceLandmarkerRef = useRef<MediaPipeFaceLandmarker | null>(null);
  const faceLandmarkerLoadRef = useRef<Promise<MediaPipeFaceLandmarker | null> | null>(null);
  const previousFaceBoxRef = useRef<FaceBox | null>(null);
  const cameraHistoryRef = useRef<CameraHistorySample[]>([]);
  const cameraAttemptedRef = useRef(false);
  const [searchParams] = useSearchParams();
  const routeState = (location.state ?? {}) as QuizLaunchState;
  const selectedNoteId = selectedFiles[0]?.noteId ?? "";
  const noteId =
    searchParams.get("noteId") ?? routeState.noteId ?? selectedNoteId ?? "";
  const selectedSourceLabel = selectedFiles[0]?.originalName ?? selectedFiles[0]?.filename ?? "";
  const seededQuizContent = routeState.quizContent ?? "";
  const initialQuestionBank = useMemo(
    () => buildAdaptiveQuestionBank(seededQuizContent),
    [seededQuizContent],
  );
  const initialSession = useMemo(
    () => buildFreshSession(initialQuestionBank),
    [initialQuestionBank],
  );

  const [loading, setLoading] = useState(Boolean(noteId) && initialQuestionBank.length === 0);
  const [error, setError] = useState<string | null>(
    !noteId && initialQuestionBank.length === 0
      ? "Select a source in chats first, then open /quiz so the page knows which notebook to use."
      : null,
  );
  const [questionBank, setQuestionBank] =
    useState<AdaptiveQuizQuestion[]>(initialQuestionBank);
  const [studentState, setStudentState] =
    useState<StudentState>(initialSession.studentState);
  const [askedIds, setAskedIds] = useState<string[]>(initialSession.askedIds);
  const [attempts, setAttempts] = useState<QuizAttempt[]>(initialSession.attempts);
  const [feedback, setFeedback] =
    useState<FeedbackState | null>(initialSession.feedback);
  const [confidenceMap, setConfidenceMap] = useState<
    Record<string, ConfidenceLevel>
  >(initialSession.confidenceMap);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(
    initialSession.currentQuestionId,
  );
  const [questionStartedAt, setQuestionStartedAt] = useState(
    initialSession.questionStartedAt,
  );
  const [elapsedMs, setElapsedMs] = useState(initialSession.elapsedMs);
  const [hintVisible, setHintVisible] = useState(initialSession.hintVisible);
  const [cameraSignal, setCameraSignal] =
    useState<CameraSignalState>(DEFAULT_CAMERA_SIGNAL);
  const [videoReady, setVideoReady] = useState(false);

  const targetQuestionCount = useMemo(
    () => getTargetQuestionCount(questionBank),
    [questionBank],
  );
  const currentQuestion = useMemo(
    () =>
      questionBank.find((question) => question.id === currentQuestionId) ?? null,
    [currentQuestionId, questionBank],
  );
  const currentConfidence = currentQuestion
    ? confidenceMap[currentQuestion.id] ?? "medium"
    : "medium";
  const correctCount = useMemo(
    () => attempts.filter((attempt) => attempt.wasCorrect).length,
    [attempts],
  );
  const accuracy = useMemo(
    () => getScorePercentage(correctCount, attempts.length),
    [attempts.length, correctCount],
  );
  const progressPercent =
    targetQuestionCount > 0
      ? Math.min(
          100,
          (((askedIds.length + (feedback ? 1 : 0)) / targetQuestionCount) * 100),
        )
      : 0;
  const currentQuestionNumber = Math.min(
    targetQuestionCount || 1,
    currentQuestion ? askedIds.length + 1 : targetQuestionCount || 1,
  );
  const isComplete = currentQuestionId === null && attempts.length > 0;
  const emotionSummary = useMemo(
    () => buildEmotionJourneySummary(attempts),
    [attempts],
  );
  const cameraEmotionLabel = cameraSignal.expressionSignal
    ? emotionMeta[cameraSignal.expressionSignal].label
    : "Fallback";
  const cameraEmotionAccent = cameraSignal.expressionSignal
    ? emotionMeta[cameraSignal.expressionSignal].accent
    : "text-slate-200";
  const isCameraLive = cameraSignal.permission === "granted";
  const cameraStatusLabel =
    cameraSignal.permission === "granted"
      ? "Live"
      : cameraSignal.permission === "requesting"
        ? "Requesting"
        : cameraSignal.permission === "denied"
          ? "Blocked"
        : cameraSignal.permission === "unsupported"
            ? "Unsupported"
            : "Off";
  const adaptiveSelectionState = useMemo(() => {
    if (cameraSignal.permission !== "granted" || !cameraSignal.expressionSignal) {
      return studentState;
    }

    if (cameraSignal.expressionSignal === "engaged") {
      return {
        ...studentState,
        emotionState: "engaged" as const,
        difficultyLevel: clampDifficultyLevel(studentState.difficultyLevel + 1),
      };
    }

    if (
      cameraSignal.expressionSignal === "confused" ||
      cameraSignal.expressionSignal === "frustrated"
    ) {
      return {
        ...studentState,
        emotionState: cameraSignal.expressionSignal,
        difficultyLevel: clampDifficultyLevel(studentState.difficultyLevel - 1),
      };
    }

    return studentState;
  }, [cameraSignal.expressionSignal, cameraSignal.permission, studentState]);

  const getFaceLandmarker = async () => {
    if (faceLandmarkerRef.current) {
      return faceLandmarkerRef.current;
    }

    if (faceLandmarkerLoadRef.current) {
      return faceLandmarkerLoadRef.current;
    }

    faceLandmarkerLoadRef.current = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const wasmFiles = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        const faceLandmarker = await vision.FaceLandmarker.createFromOptions(wasmFiles, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_FACE_MODEL_URL,
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputFaceBlendshapes: true,
        });

        faceLandmarkerRef.current = faceLandmarker;
        return faceLandmarker;
      } catch {
        return null;
      } finally {
        faceLandmarkerLoadRef.current = null;
      }
    })();

    return faceLandmarkerLoadRef.current;
  };

  const attachStreamToVideoElement = async (videoElement: HTMLVideoElement | null) => {
    if (!videoElement || !streamRef.current) {
      return;
    }

    if (videoElement.srcObject !== streamRef.current) {
      videoElement.srcObject = streamRef.current;
    }

    try {
      await videoElement.play();
      setVideoReady(true);
    } catch {
      return;
    }
  };

  const stopCameraStream = () => {
    if (detectorIntervalRef.current) {
      window.clearInterval(detectorIntervalRef.current);
      detectorIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    previousFaceBoxRef.current = null;
    cameraHistoryRef.current = [];
    analysisPendingRef.current = false;
    setVideoReady(false);
    setCameraSignal({
      permission: "idle",
      detectorMode: "unsupported",
      faceVisible: false,
      attentionScore: 0,
      expressionSignal: null,
      statusMessage:
        "Camera paused. The quiz will keep adapting using your performance, timing, and confidence.",
      samples: 0,
    });
  };

  const startFaceDetection = async () => {
    if (detectorIntervalRef.current) {
      analysisPendingRef.current = false;
      return;
    }

    if (!videoRef.current) {
      analysisPendingRef.current = true;
      setCameraSignal((currentSignal) =>
        currentSignal.permission === "granted"
          ? {
              ...currentSignal,
              statusMessage:
                "Camera stream is live. Waiting for the quiz camera panel to mount before emotion analysis starts.",
            }
          : currentSignal,
      );
      return;
    }

    analysisPendingRef.current = false;
    const mediaPipeLandmarker = await getFaceLandmarker();

    if (mediaPipeLandmarker) {
      if (detectorIntervalRef.current) {
        window.clearInterval(detectorIntervalRef.current);
      }

      detectorIntervalRef.current = window.setInterval(() => {
        const videoElement = videoRef.current;

        if (!videoElement || videoElement.readyState < 2) {
          return;
        }

        try {
          const detectionResult = mediaPipeLandmarker.detectForVideo(
            videoElement,
            performance.now(),
          );
          const faceLandmarks = detectionResult.faceLandmarks?.[0] ?? [];
          const hasFace = faceLandmarks.length > 0;
          const blendshapeMetrics = analyzeBlendshapes(detectionResult.faceBlendshapes);

          cameraHistoryRef.current = [
            ...cameraHistoryRef.current.slice(-7),
            {
              visible: hasFace,
              motion: 0,
              focus: hasFace ? blendshapeMetrics.focus : 0,
              engaged: hasFace ? blendshapeMetrics.engaged : 0,
              confused: hasFace ? blendshapeMetrics.confused : 0,
              frustrated: hasFace ? blendshapeMetrics.frustrated : 0,
            },
          ];

          const history = cameraHistoryRef.current;
          const visibleRatio =
            history.filter((sample) => sample.visible).length / Math.max(history.length, 1);
          const averageFocus =
            history.reduce((sum, sample) => sum + sample.focus, 0) / Math.max(history.length, 1);
          const averageEngaged =
            history.reduce((sum, sample) => sum + sample.engaged, 0) / Math.max(history.length, 1);
          const averageConfused =
            history.reduce((sum, sample) => sum + sample.confused, 0) / Math.max(history.length, 1);
          const averageFrustrated =
            history.reduce((sum, sample) => sum + sample.frustrated, 0) /
            Math.max(history.length, 1);
          const attentionScore = Math.max(
            0,
            Math.min(100, Math.round(visibleRatio * 50 + averageFocus * 50)),
          );

          let expressionSignal: EmotionState = "neutral";
          let statusMessage =
            "MediaPipe blendshapes are active. The quiz is now reading webcam-based focus and facial cues.";

          if (visibleRatio < 0.35) {
            expressionSignal = "frustrated";
            statusMessage =
              "Your face moved out of frame several times, so the system is treating this as a low-focus or frustrated moment.";
          } else if (averageFrustrated > 0.42) {
            expressionSignal = "frustrated";
            statusMessage =
              "Facial tension cues look elevated, so the next question will simplify and prerequisite help stays ready.";
          } else if (averageConfused > 0.36) {
            expressionSignal = "confused";
            statusMessage =
              "Facial uncertainty cues are rising, so the quiz is ready to unlock hints and easier follow-ups.";
          } else if (averageEngaged > 0.56 && attentionScore > 72) {
            expressionSignal = "engaged";
            statusMessage =
              "The webcam is seeing focused, engaged cues, so the quiz can climb toward harder application questions.";
          }

          setCameraSignal({
            permission: "granted",
            detectorMode: "mediapipe",
            faceVisible: hasFace,
            attentionScore,
            expressionSignal,
            statusMessage,
            samples: history.length,
          });
        } catch {
          setCameraSignal({
            permission: "granted",
            detectorMode: "webcam-only",
            faceVisible: true,
            attentionScore: 55,
            expressionSignal: null,
            statusMessage:
              "Camera is live, but MediaPipe frame analysis failed. The quiz is falling back to timing, confidence, and correctness.",
            samples: 0,
          });
        }
      }, 1600);

      return;
    }

    if (typeof window === "undefined" || !window.FaceDetector) {
      setCameraSignal({
        permission: "granted",
        detectorMode: "webcam-only",
        faceVisible: true,
        attentionScore: 55,
        expressionSignal: null,
        statusMessage:
          "Camera is live, but advanced face analysis could not load. The quiz will still adapt from timing, confidence, and correctness.",
        samples: 0,
      });
      return;
    }

    const detector = new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 1,
    });

    if (detectorIntervalRef.current) {
      window.clearInterval(detectorIntervalRef.current);
    }

    detectorIntervalRef.current = window.setInterval(async () => {
      const videoElement = videoRef.current;

      if (!videoElement || videoElement.readyState < 2) {
        return;
      }

      try {
        const faces = await detector.detect(videoElement);
        const firstFace = faces[0];
        const currentFaceBox = firstFace?.boundingBox
          ? {
              x: firstFace.boundingBox.x,
              y: firstFace.boundingBox.y,
              width: firstFace.boundingBox.width,
              height: firstFace.boundingBox.height,
            }
          : null;
        const previousFaceBox = previousFaceBoxRef.current;
        let motion = 0;

        if (currentFaceBox && previousFaceBox) {
          const horizontalDelta = Math.abs(currentFaceBox.x - previousFaceBox.x);
          const verticalDelta = Math.abs(currentFaceBox.y - previousFaceBox.y);
          const widthDelta = Math.abs(currentFaceBox.width - previousFaceBox.width);
          const normalizer = Math.max(videoElement.videoWidth, 1);
          motion = (horizontalDelta + verticalDelta + widthDelta) / normalizer;
        }

        previousFaceBoxRef.current = currentFaceBox;
        cameraHistoryRef.current = [
          ...cameraHistoryRef.current.slice(-7),
          {
            visible: Boolean(firstFace),
            motion,
            focus: 0,
            engaged: 0,
            confused: 0,
            frustrated: 0,
          },
        ];

        const visibleRatio =
          cameraHistoryRef.current.filter((sample) => sample.visible).length /
          Math.max(cameraHistoryRef.current.length, 1);
        const averageMotion =
          cameraHistoryRef.current.reduce((sum, sample) => sum + sample.motion, 0) /
          Math.max(cameraHistoryRef.current.length, 1);
        let attentionScore = Math.round(
          visibleRatio * 72 + Math.max(0, 28 - averageMotion * 220),
        );

        attentionScore = Math.max(0, Math.min(100, attentionScore));

        let expressionSignal: EmotionState = "neutral";
        let statusMessage =
          "Camera is live. The quiz is reading face presence and focus stability alongside your answers.";

        if (visibleRatio < 0.35) {
          expressionSignal = "frustrated";
          statusMessage =
            "Face presence dropped for a few checks, so the system is treating this as a strained or distracted moment.";
        } else if (averageMotion > 0.14) {
          expressionSignal = "confused";
          statusMessage =
            "Frequent head movement suggests uncertainty, so hints and simpler follow-ups stay ready.";
        } else if (visibleRatio > 0.8 && averageMotion < 0.05) {
          expressionSignal = "engaged";
          attentionScore = Math.max(attentionScore, 82);
          statusMessage =
            "Stable face presence and low movement suggest high focus, so the quiz can stretch harder when you answer well.";
        }

        setCameraSignal({
          permission: "granted",
          detectorMode: "face-detector",
          faceVisible: Boolean(firstFace),
          attentionScore,
          expressionSignal,
          statusMessage,
          samples: cameraHistoryRef.current.length,
        });
      } catch {
        if (detectorIntervalRef.current) {
          window.clearInterval(detectorIntervalRef.current);
          detectorIntervalRef.current = null;
        }

        setCameraSignal({
          permission: "granted",
          detectorMode: "webcam-only",
          faceVisible: true,
          attentionScore: 55,
          expressionSignal: null,
          statusMessage:
            "Camera is live, but browser face analysis stopped responding. The quiz is falling back to performance-based emotion cues.",
          samples: 0,
        });
      }
    }, 2400);
  };

  const enableCamera = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraSignal({
        permission: "unsupported",
        detectorMode: "unsupported",
        faceVisible: false,
        attentionScore: 0,
        expressionSignal: null,
        statusMessage:
          "This browser does not expose webcam APIs here, so the quiz will adapt using performance signals only.",
        samples: 0,
      });
      return;
    }

    setCameraSignal((currentSignal) => ({
      ...currentSignal,
      permission: "requesting",
      statusMessage: "Requesting webcam access for the adaptive emotion layer...",
    }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
        },
        audio: false,
      });

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      streamRef.current = stream;
      setVideoReady(false);
      analysisPendingRef.current = true;

      if (videoRef.current) {
        await attachStreamToVideoElement(videoRef.current);
      }

      setCameraSignal({
        permission: "granted",
        detectorMode: "webcam-only",
        faceVisible: false,
        attentionScore: 0,
        expressionSignal: "neutral",
        statusMessage:
          "Camera is live. Loading cross-browser face analysis so the quiz can read webcam emotion cues.",
        samples: 0,
      });
      await startFaceDetection();
    } catch {
      analysisPendingRef.current = false;
      setCameraSignal({
        permission: "denied",
        detectorMode: "unsupported",
        faceVisible: false,
        attentionScore: 0,
        expressionSignal: null,
        statusMessage:
          "Webcam access was blocked. Allow camera permission to blend visual focus cues into the quiz.",
        samples: 0,
      });
    }
  };

  useEffect(() => {
    if (!currentQuestion || feedback) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - questionStartedAt);
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [currentQuestion, feedback, questionStartedAt]);

  useEffect(() => {
    if (cameraAttemptedRef.current) {
      return;
    }

    cameraAttemptedRef.current = true;
    void enableCamera();

    return () => {
      stopCameraStream();
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      faceLandmarkerLoadRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      cameraSignal.permission !== "granted" ||
      !analysisPendingRef.current ||
      detectorIntervalRef.current ||
      !videoRef.current
    ) {
      return;
    }

    void startFaceDetection();
  }, [cameraSignal.permission, currentQuestionId, loading, videoReady]);

  useEffect(() => {
    if (!noteId) {
      return;
    }

    let isCancelled = false;

    const syncLatestQuiz = async () => {
      setLoading(true);

      try {
        const data = await getChatHistory(noteId);

        if (isCancelled) {
          return;
        }

        const latestQuizMessage = [...data.messages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" &&
              (message.toolUsed === "Quiz" ||
                parseQuizQuestions(message.content).length >= 4),
          );

        if (!latestQuizMessage) {
          if (!seededQuizContent) {
            setError(
              "No saved quiz was found for this notebook yet. Generate one from /chats first.",
            );
          }
          return;
        }

        const nextQuestionBank = buildAdaptiveQuestionBank(latestQuizMessage.content);

        if (nextQuestionBank.length === 0) {
          setError(
            "A quiz response was found, but it could not be parsed into interactive questions.",
          );
          return;
        }

        const nextSession = buildFreshSession(nextQuestionBank);

        startTransition(() => {
          setError(null);
          setQuestionBank(nextQuestionBank);
          setStudentState(nextSession.studentState);
          setAskedIds(nextSession.askedIds);
          setAttempts(nextSession.attempts);
          setFeedback(nextSession.feedback);
          setConfidenceMap(nextSession.confidenceMap);
          setCurrentQuestionId(nextSession.currentQuestionId);
          setQuestionStartedAt(nextSession.questionStartedAt);
          setElapsedMs(nextSession.elapsedMs);
          setHintVisible(nextSession.hintVisible);
        });
      } catch {
        if (!isCancelled && !seededQuizContent) {
          setError("The latest quiz could not be loaded from chat history right now.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void syncLatestQuiz();

    return () => {
      isCancelled = true;
    };
  }, [noteId, seededQuizContent]);

  const handleSelectConfidence = (level: ConfidenceLevel) => {
    if (!currentQuestion || feedback) {
      return;
    }

    setConfidenceMap((currentMap) => ({
      ...currentMap,
      [currentQuestion.id]: level,
    }));
  };

  const handleAnswer = (selectedIndex: number) => {
    if (!currentQuestion || feedback) {
      return;
    }

    const responseTimeMs = Date.now() - questionStartedAt;
    const wasCorrect = selectedIndex === currentQuestion.correctIndex;
    const nextAnsweredCount = attempts.length + 1;
    const nextCorrectCount = correctCount + (wasCorrect ? 1 : 0);
    const confidenceLevel = confidenceMap[currentQuestion.id] ?? "medium";
    const nextState = deriveStudentState({
      previousState: studentState,
      isCorrect: wasCorrect,
      responseTimeMs,
      difficulty: currentQuestion.difficulty,
      answeredCount: nextAnsweredCount,
      correctCount: nextCorrectCount,
      targetQuestionCount,
    });
    const cameraAdjustedState = blendCameraEmotion({
      baseState: nextState.studentState,
      wasCorrect,
      confidence: confidenceLevel,
      cameraSignal,
    });
    const combinedEncouragement = [
      nextState.encouragingMessage,
      cameraAdjustedState.cameraMessage,
    ]
      .filter(Boolean)
      .join(" ");

    const nextAttempt: QuizAttempt = {
      questionId: currentQuestion.id,
      questionNumber: askedIds.length + 1,
      question: currentQuestion.question,
      wasCorrect,
      selectedIndex,
      correctIndex: currentQuestion.correctIndex,
      responseTimeMs,
      confidence: confidenceLevel,
      emotionAfter: cameraAdjustedState.studentState.emotionState,
      difficultyAfter: cameraAdjustedState.studentState.difficultyLevel,
      type: currentQuestion.type,
    };

    setAttempts((currentAttempts) => [...currentAttempts, nextAttempt]);
    setStudentState(cameraAdjustedState.studentState);
    setFeedback({
      selectedIndex,
      wasCorrect,
      responseTimeMs,
      nextEmotion: cameraAdjustedState.studentState.emotionState,
      showHint:
        cameraAdjustedState.studentState.emotionState === "confused" ||
        cameraAdjustedState.studentState.emotionState === "frustrated",
      showPrerequisite:
        cameraAdjustedState.studentState.emotionState === "frustrated",
      encouragingMessage: combinedEncouragement || undefined,
    });
  };

  const handleAdvance = () => {
    if (!currentQuestion) {
      return;
    }

    const nextAskedIds = [...askedIds, currentQuestion.id];
    const reachedTarget =
      nextAskedIds.length >= targetQuestionCount ||
      nextAskedIds.length >= questionBank.length;

    setAskedIds(nextAskedIds);
    setFeedback(null);
    setHintVisible(false);

    if (reachedTarget) {
      setCurrentQuestionId(null);
      return;
    }

    const nextQuestion = pickNextQuestion({
      questions: questionBank,
      askedIds: new Set(nextAskedIds),
      studentState: adaptiveSelectionState,
    });

    if (!nextQuestion) {
      setCurrentQuestionId(null);
      return;
    }

    setCurrentQuestionId(nextQuestion.id);
    setQuestionStartedAt(Date.now());
    setElapsedMs(0);
  };

  const handleRetry = () => {
    const nextSession = buildFreshSession(questionBank);
    setStudentState(nextSession.studentState);
    setAskedIds(nextSession.askedIds);
    setAttempts(nextSession.attempts);
    setFeedback(nextSession.feedback);
    setConfidenceMap(nextSession.confidenceMap);
    setCurrentQuestionId(nextSession.currentQuestionId);
    setQuestionStartedAt(nextSession.questionStartedAt);
    setElapsedMs(nextSession.elapsedMs);
    setHintVisible(nextSession.hintVisible);
    setError(null);
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#0f0f0f] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-8 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/12 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate("/chats")}
                className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <ArrowLeft />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Adaptive Quiz Mode
                </p>
                <h1
                  className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
                  style={{ fontFamily: '"Trebuchet MS", "Gill Sans", sans-serif' }}
                >
                  Immersive quiz practice with emotion-aware pacing
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  The quiz reads your accuracy, streaks, confidence, and response
                  speed to shift difficulty in real time without leaving the page.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div
                className={cn(
                  "rounded-2xl border px-4 py-3 backdrop-blur-xl",
                  emotionMeta[studentState.emotionState].panel,
                )}
              >
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Emotion
                </p>
                <p
                  className={cn(
                    "mt-2 text-lg font-semibold",
                    emotionMeta[studentState.emotionState].accent,
                  )}
                >
                  {emotionMeta[studentState.emotionState].label}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {emotionMeta[studentState.emotionState].helper}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Accuracy
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{accuracy}%</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {correctCount} correct out of {attempts.length || targetQuestionCount || 0}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Difficulty
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {difficultyMeta[studentState.difficultyLevel].label}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {difficultyMeta[studentState.difficultyLevel].helper}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                  Webcam
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{cameraStatusLabel}</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {isCameraLive
                    ? `${cameraEmotionLabel} cue · ${cameraSignal.attentionScore}% attention`
                    : "Visual emotion cues are currently offline."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.22em] text-slate-400">
              <span>
                Question {Math.min(currentQuestionNumber, targetQuestionCount || 1)} of{" "}
                {targetQuestionCount || 1}
              </span>
              <span>{Math.round(progressPercent)}% complete</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-fuchsia-500 to-cyan-300 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </header>

        <main className="mt-6 flex flex-1 flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Card className="w-full max-w-xl border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
                <CardContent className="px-6 py-12 text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-sky-400/20 bg-sky-500/10 text-sky-200">
                    <Sparkles className="animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-semibold text-white">
                    Pulling your latest quiz from chat history
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    The adaptive engine is reading the saved quiz for this notebook
                    and building a progression path.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : error && questionBank.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Card className="w-full max-w-2xl border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <CardContent className="px-6 py-10 sm:px-10">
                  <div className="inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-sky-200">
                    Quiz source needed
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">
                    No adaptive quiz is ready yet
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                    {error}
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      onClick={() => navigate("/chats")}
                      className="rounded-full bg-gradient-to-r from-sky-500 to-fuchsia-500 text-white"
                    >
                      Open chats
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("/notes")}
                      className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      Go to notes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : isComplete ? (
            <div className="grid flex-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <CardContent className="px-6 py-7 sm:px-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-emerald-200">
                        Session complete
                      </div>
                      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                        {accuracy >= 80
                          ? "Strong finish. You handled the climb well."
                          : accuracy >= 60
                            ? "Solid recovery curve with room to sharpen."
                            : "Good start. The adaptive path found where to reinforce."}
                      </h2>
                      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                        {emotionSummary}
                      </p>
                    </div>

                    <div className="grid min-w-52 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                          Final score
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">
                          {correctCount}/{attempts.length}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">{accuracy}% accuracy</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                          Avg. response
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">
                          {formatAverageTime(attempts)}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          Faster answers usually tracked with higher confidence.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Peak difficulty
                      </p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {
                          difficultyMeta[
                            Math.max(
                              ...attempts.map((attempt) => attempt.difficultyAfter),
                              1,
                            ) as 1 | 2 | 3
                          ].label
                        }
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Best streak
                      </p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {Math.max(
                          0,
                          ...attempts.reduce<number[]>((collection, attempt, index) => {
                            const previous = index > 0 ? collection[index - 1] : 0;
                            collection.push(attempt.wasCorrect ? previous + 1 : 0);
                            return collection;
                          }, []),
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Confidence trend
                      </p>
                      <p className="mt-2 text-xl font-semibold text-white">
                        {attempts[attempts.length - 1]?.confidence === "high"
                          ? "Ended strong"
                          : attempts.some((attempt) => attempt.confidence === "high")
                            ? "Built confidence"
                            : "Still calibrating"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 rounded-[28px] border border-white/10 bg-black/20 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Difficulty progression
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-white">
                          How the adaptive engine escalated
                        </h3>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                        <Rocket className="h-4 w-4 text-fuchsia-300" />
                        Dynamic progression
                      </div>
                    </div>

                    <div className="mt-6 flex items-end gap-3 overflow-x-auto pb-2">
                      {attempts.map((attempt) => (
                        <div
                          key={attempt.questionId}
                          className="min-w-14 flex-1 animate-in fade-in slide-in-from-bottom-3 duration-500"
                        >
                          <div className="mb-2 text-center text-xs text-slate-400">
                            Q{attempt.questionNumber}
                          </div>
                          <div className="flex h-28 items-end justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2">
                            <div
                              className={cn(
                                "w-full rounded-xl bg-gradient-to-t transition-all duration-500",
                                attempt.difficultyAfter === 1
                                  ? "from-sky-500/70 to-cyan-300/80"
                                  : attempt.difficultyAfter === 2
                                    ? "from-violet-500/70 to-fuchsia-400/80"
                                    : "from-fuchsia-500/75 to-indigo-300/80",
                              )}
                              style={{
                                height:
                                  attempt.difficultyAfter === 1
                                    ? "32%"
                                    : attempt.difficultyAfter === 2
                                      ? "62%"
                                      : "100%",
                              }}
                            />
                          </div>
                          <div className="mt-2 text-center text-[0.7rem] uppercase tracking-[0.18em] text-slate-400">
                            {difficultyMeta[attempt.difficultyAfter].label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-6 py-6">
                    <div className="flex items-center gap-3">
                      <BrainCircuit className="h-5 w-5 text-sky-300" />
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Emotion journey
                        </p>
                        <h3 className="mt-1 text-xl font-semibold text-white">
                          Where the quiz adapted
                        </h3>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {attempts.map((attempt) => (
                        <div
                          key={`${attempt.questionId}-emotion`}
                          className={cn(
                            "rounded-2xl border px-4 py-3",
                            emotionMeta[attempt.emotionAfter].panel,
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-white">
                              Question {attempt.questionNumber}
                            </span>
                            <span
                              className={cn(
                                "text-xs uppercase tracking-[0.18em]",
                                emotionMeta[attempt.emotionAfter].accent,
                              )}
                            >
                              {emotionMeta[attempt.emotionAfter].label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            {attempt.wasCorrect
                              ? "Correct answer"
                              : "Incorrect answer"}{" "}
                            in {formatResponseTime(attempt.responseTimeMs)} with{" "}
                            {attempt.confidence} confidence.
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-6 py-6">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Next move
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      Keep the momentum going
                    </h3>
                    <div className="mt-5 grid gap-3">
                      <Button
                        type="button"
                        onClick={handleRetry}
                        className="justify-between rounded-2xl bg-gradient-to-r from-sky-500 to-fuchsia-500 px-5 py-6 text-white"
                      >
                        Retry this adaptive session
                        <RefreshCcw />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate("/notes")}
                        className="justify-between rounded-2xl border-white/12 bg-white/5 px-5 py-6 text-white hover:bg-white/10"
                      >
                        Go to next topic
                        <ChevronRight />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => navigate("/chats")}
                        className="justify-between rounded-2xl border border-white/10 bg-transparent px-5 py-6 text-white hover:bg-white/[0.08]"
                      >
                        Back to chats
                        <ArrowLeft />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : currentQuestion ? (
            <div className="grid flex-1 gap-6 xl:grid-cols-[1.3fr_0.8fr]">
              <Card
                key={currentQuestion.id}
                className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-3 duration-500"
              >
                <CardContent className="relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-r opacity-70 blur-2xl",
                      difficultyMeta[currentQuestion.difficulty].glow,
                    )}
                  />

                  <div className="relative">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-sky-200">
                          {difficultyMeta[currentQuestion.difficulty].label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-200">
                          {typeLabels[currentQuestion.type]}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]",
                            emotionMeta[studentState.emotionState].panel,
                            emotionMeta[studentState.emotionState].accent,
                          )}
                        >
                          {emotionMeta[studentState.emotionState].label}
                        </span>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
                          Response timer
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
                          <TimerReset className="h-4 w-4 text-sky-300" />
                          {formatResponseTime(elapsedMs)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-8">
                      <p className="text-sm uppercase tracking-[0.22em] text-slate-400">
                        Prompt
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold leading-tight text-white sm:text-[2rem]">
                        {currentQuestion.question}
                      </h2>
                    </div>

                    <div className="mt-8 grid gap-3">
                      {currentQuestion.options.map((option, optionIndex) => {
                        const isSelected = feedback?.selectedIndex === optionIndex;
                        const isCorrectOption =
                          currentQuestion.correctIndex === optionIndex;
                        const showCorrectState = Boolean(feedback) && isCorrectOption;
                        const showWrongState =
                          Boolean(feedback) && isSelected && !feedback?.wasCorrect;

                        return (
                          <button
                            key={`${currentQuestion.id}-option-${optionIndex}`}
                            type="button"
                            onClick={() => handleAnswer(optionIndex)}
                            disabled={Boolean(feedback)}
                            className={cn(
                              "group relative overflow-hidden rounded-[24px] border px-5 py-5 text-left transition-all duration-300",
                              "border-white/10 bg-white/[0.04] hover:border-sky-400/40 hover:bg-sky-500/10 hover:-translate-y-0.5",
                              feedback && "cursor-default",
                              showCorrectState &&
                                "border-emerald-400/60 bg-emerald-500/18 shadow-[0_0_40px_rgba(16,185,129,0.12)]",
                              showWrongState &&
                                "border-rose-400/60 bg-rose-500/18 shadow-[0_0_40px_rgba(244,63,94,0.12)]",
                              isSelected &&
                                !feedback &&
                                "border-sky-300/60 bg-sky-500/12 shadow-[0_0_35px_rgba(56,189,248,0.12)]",
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition-all",
                                  showCorrectState
                                    ? "border-emerald-300/50 bg-emerald-400/20 text-emerald-50"
                                    : showWrongState
                                      ? "border-rose-300/50 bg-rose-400/20 text-rose-50"
                                      : "border-white/10 bg-white/[0.08] text-slate-100 group-hover:border-sky-300/50 group-hover:bg-sky-500/12",
                                )}
                              >
                                {String.fromCharCode(65 + optionIndex)}
                              </div>
                              <div className="flex-1">
                                <p className="text-base leading-7 text-slate-100">{option}</p>
                                {showCorrectState ? (
                                  <p className="mt-2 text-sm text-emerald-200">
                                    Correct choice
                                  </p>
                                ) : showWrongState ? (
                                  <p className="mt-2 text-sm text-rose-200">
                                    Not quite. The correct answer is highlighted.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <CircleGauge className="h-5 w-5 text-sky-300" />
                        <div>
                          <p className="text-sm font-medium text-white">
                            How confident are you?
                          </p>
                          <p className="text-xs text-slate-400">
                            This helps the adaptive system read your engagement, not
                            just correctness.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {CONFIDENCE_OPTIONS.map((confidence) => {
                          const isActive = currentConfidence === confidence.level;

                          return (
                            <button
                              key={confidence.level}
                              type="button"
                              onClick={() => handleSelectConfidence(confidence.level)}
                              disabled={Boolean(feedback)}
                              className={cn(
                                "rounded-2xl border px-4 py-4 text-left transition-all duration-300",
                                isActive
                                  ? "border-sky-300/50 bg-sky-500/12 shadow-[0_0_35px_rgba(56,189,248,0.12)]"
                                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]",
                              )}
                            >
                              <div className="text-2xl">{confidence.emoji}</div>
                              <p className="mt-2 text-sm font-medium text-white">
                                {confidence.label}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-400">
                                {confidence.helper}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {!feedback &&
                    cameraSignal.permission === "granted" &&
                    currentQuestion &&
                    cameraSignal.expressionSignal ? (
                      <div
                        className={cn(
                          "mt-6 rounded-[24px] border p-4",
                          emotionMeta[cameraSignal.expressionSignal].panel,
                        )}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                              Live camera cue
                            </p>
                            <h3 className={cn("mt-2 text-lg font-semibold", cameraEmotionAccent)}>
                              {cameraEmotionLabel}
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-slate-200">
                              {cameraSignal.expressionSignal === "engaged"
                                ? "The next question will lean harder and more application-focused if this engaged state holds."
                                : "The adaptive system is easing the path and surfacing support because the camera sees strain or uncertainty."}
                            </p>
                          </div>

                          {(cameraSignal.expressionSignal === "confused" ||
                            cameraSignal.expressionSignal === "frustrated") && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setHintVisible((currentValue) => !currentValue)}
                              className="rounded-full border-white/15 bg-white/8 text-white hover:bg-white/12"
                            >
                              {hintVisible ? "Hide support" : "Show support"}
                            </Button>
                          )}
                        </div>

                        {hintVisible &&
                        (cameraSignal.expressionSignal === "confused" ||
                          cameraSignal.expressionSignal === "frustrated") ? (
                          <div className="mt-4 grid gap-3">
                            <div className="rounded-2xl border border-sky-300/20 bg-sky-950/25 px-4 py-4 text-sm leading-7 text-sky-50">
                              Here's a tip: {currentQuestion.hint}
                            </div>
                            {cameraSignal.expressionSignal === "frustrated" ? (
                              <div className="rounded-2xl border border-amber-300/20 bg-amber-950/20 px-4 py-4 text-sm leading-7 text-amber-50">
                                Before this, review: {currentQuestion.prerequisite}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {feedback && (
                      <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div
                          className={cn(
                            "rounded-[24px] border px-5 py-5",
                            feedback.wasCorrect
                              ? "border-emerald-400/30 bg-emerald-500/12"
                              : "border-rose-400/30 bg-rose-500/12",
                          )}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-slate-300">
                                {feedback.wasCorrect
                                  ? "Correct answer"
                                  : "Incorrect answer"}
                              </p>
                              <h3 className="mt-2 text-xl font-semibold text-white">
                                {feedback.wasCorrect
                                  ? "Nice work. That landed cleanly."
                                  : "Almost there. Here's the right path."}
                              </h3>
                              <p className="mt-3 text-sm leading-7 text-slate-200">
                                {currentQuestion.explanation}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                              <div>{formatResponseTime(feedback.responseTimeMs)}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                                {emotionMeta[feedback.nextEmotion].label} next
                              </div>
                            </div>
                          </div>
                        </div>

                        {feedback.encouragingMessage ? (
                          <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-5 py-4 text-sm leading-7 text-slate-200">
                            {feedback.encouragingMessage}
                          </div>
                        ) : null}

                        {feedback.showHint ? (
                          <div className="rounded-[24px] border border-sky-400/30 bg-sky-500/10 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <Lightbulb className="h-5 w-5 text-sky-200" />
                                <div>
                                  <p className="text-sm font-medium text-sky-100">
                                    Need a hint for the next step?
                                  </p>
                                  <p className="text-xs text-sky-100/70">
                                    The system noticed a wobble and unlocked a softer clue.
                                  </p>
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setHintVisible((currentValue) => !currentValue)}
                                className="rounded-full border-sky-300/25 bg-white/[0.08] text-sky-100 hover:bg-white/12"
                              >
                                {hintVisible ? "Hide hint" : "Show hint"}
                              </Button>
                            </div>

                            {hintVisible ? (
                              <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-950/25 px-4 py-4 text-sm leading-7 text-sky-50">
                                Here's a tip: {currentQuestion.hint}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {feedback.showPrerequisite ? (
                          <div className="rounded-[24px] border border-amber-400/30 bg-amber-500/10 p-4">
                            <div className="flex items-center gap-3">
                              <BrainCircuit className="h-5 w-5 text-amber-200" />
                              <div>
                                <p className="text-sm font-medium text-amber-100">
                                  Prerequisite concept
                                </p>
                                <p className="text-xs text-amber-100/70">
                                  Before this, review:
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-950/20 px-4 py-4 text-sm leading-7 text-amber-50">
                              {currentQuestion.prerequisite}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-slate-300">
                            The next question will be chosen from the same quiz bank
                            using your current emotion and performance state.
                          </p>
                          <Button
                            type="button"
                            onClick={handleAdvance}
                            className="rounded-full bg-gradient-to-r from-sky-500 to-fuchsia-500 px-5 text-white"
                          >
                            {askedIds.length + 1 >= targetQuestionCount
                              ? "See results"
                              : "Next question"}
                            <ChevronRight />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-5 py-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Webcam emotion layer
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-white">
                          Live camera signal
                        </h3>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (isCameraLive) {
                            stopCameraStream();
                            return;
                          }

                          void enableCamera();
                        }}
                        className="rounded-full border-white/12 bg-white/5 text-white hover:bg-white/10"
                      >
                        {isCameraLive ? <CameraOff /> : <Camera />}
                        {isCameraLive ? "Pause camera" : "Enable camera"}
                      </Button>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-[24px] border border-white/10 bg-black/40">
                      <div className="relative aspect-[4/3]">
                        <video
                          ref={(node) => {
                            videoRef.current = node;
                            if (node) {
                              void attachStreamToVideoElement(node);
                            }
                          }}
                          autoPlay
                          muted
                          playsInline
                          onLoadedData={() => setVideoReady(true)}
                          onCanPlay={() => setVideoReady(true)}
                          className={cn(
                            "h-full w-full object-cover transition",
                            isCameraLive ? "opacity-100" : "opacity-0",
                          )}
                          style={{ transform: "scaleX(-1)" }}
                        />
                        {!isCameraLive && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <div className="rounded-full border border-white/10 bg-white/[0.08] p-4 text-sky-200">
                              <ScanFace className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-white">
                              Webcam feed is currently off
                            </p>
                            <p className="max-w-xs text-xs leading-6 text-slate-400">
                              Turn it on to let the quiz mix camera-based focus cues
                              with performance tracking.
                            </p>
                          </div>
                        )}
                        {isCameraLive && !videoReady && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 px-6 text-center backdrop-blur-sm">
                            <div className="rounded-full border border-white/10 bg-white/[0.08] p-4 text-sky-200">
                              <Camera className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-white">
                              Starting camera preview
                            </p>
                            <p className="max-w-xs text-xs leading-6 text-slate-300">
                              The webcam stream is connected. The preview will appear as soon as the video element finishes mounting.
                            </p>
                          </div>
                        )}
                        {isCameraLive && (
                          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-black/35 px-3 py-1 text-xs text-emerald-100 backdrop-blur-xl">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                cameraSignal.faceVisible
                                  ? "bg-emerald-400"
                                  : "bg-amber-400",
                              )}
                            />
                            {cameraSignal.faceVisible ? "Face detected" : "Searching for face"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          Camera cue
                        </p>
                        <p className={cn("mt-2 text-xl font-semibold", cameraEmotionAccent)}>
                          {cameraEmotionLabel}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          {cameraSignal.detectorMode === "mediapipe"
                            ? `${cameraSignal.samples} blendshape samples collected`
                            : cameraSignal.detectorMode === "face-detector"
                            ? `${cameraSignal.samples} face samples collected`
                            : "Using webcam presence only"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          Attention score
                        </p>
                        <p className="mt-2 text-xl font-semibold text-white">
                          {cameraSignal.attentionScore}%
                        </p>
                        <div className="mt-3 h-2 rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-fuchsia-500 transition-all duration-500"
                            style={{ width: `${cameraSignal.attentionScore}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-slate-300">
                      {cameraSignal.statusMessage}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-5 py-6">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Student state
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      Performance tracking
                    </h3>

                    <div className="mt-5 grid gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <span>Score</span>
                          <span>{studentState.score}%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-fuchsia-500 transition-all duration-500"
                            style={{ width: `${studentState.score}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Correct streak
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {studentState.streak}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Wrong streak
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {studentState.wrongStreak}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          Question source
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                          The page is using the existing saved quiz response from chat
                          history
                          {selectedSourceLabel ? ` for ${selectedSourceLabel}` : noteId ? ` for note ${noteId.slice(0, 8)}...` : ""}.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-5 py-6">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Adaptive rules
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      What changes next
                    </h3>

                    <div className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        2 or more wrong answers in a row shifts the quiz into a confused
                        mode, lowers difficulty, and unlocks hints.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        Slow responses paired with a wrong answer trigger a frustrated
                        mode so prerequisite concepts can appear.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        Webcam face presence and focus stability can reinforce confusion,
                        frustration, or engaged states on top of answer performance.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        3 correct answers in a row pushes difficulty upward and
                        prioritizes application questions.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        Scoring above 80% at the midpoint jumps the remaining path to
                        hard mode.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.06] py-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <CardContent className="px-5 py-6">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Session controls
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      Stay in flow
                    </h3>
                    <div className="mt-5 grid gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRetry}
                        className="justify-between rounded-2xl border-white/12 bg-white/5 px-5 py-6 text-white hover:bg-white/10"
                      >
                        Restart this quiz
                        <RefreshCcw />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => navigate("/chats")}
                        className="justify-between rounded-2xl border border-white/10 bg-transparent px-5 py-6 text-white hover:bg-white/[0.08]"
                      >
                        Back to chats
                        <ArrowLeft />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
