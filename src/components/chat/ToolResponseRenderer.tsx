import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, GitBranch, HelpCircle, Pause, Play, SkipBack, SkipForward, Sparkles, Star, Video, Volume2 } from "lucide-react";
import type { StudioToolLabel } from "@/config/studio-tools";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolResponseRendererProps = {
    toolUsed: string;
    content: string;
};

type AudioSegment = {
    type: "speaker" | "stage" | "narration";
    label?: string;
    text: string;
};

type VideoScene = {
    title: string;
    description: string;
    visuals: string;
    narration: string;
};

type Flashcard = {
    question: string;
    answer: string;
};

type QuizQuestion = {
    prompt: string;
    options: { label: string; text: string }[];
    correctAnswer?: string;
};

type ReportSection = {
    title: string;
    body: string[];
};

type MindMapNode = {
    text: string;
    depth: number;
};

const TOOL_META: Record<StudioToolLabel, { title: string; description: string; icon: ReactNode; accent: string }> = {
    "Audio Overview": {
        title: "Audio Overview",
        description: "Presented as a two-host spoken script.",
        icon: <Sparkles size={18} />,
        accent: "from-amber-50 via-orange-50 to-white border-amber-200",
    },
    "Video Overview": {
        title: "Video Overview",
        description: "Presented as a scene-by-scene explainer outline.",
        icon: <Video size={18} />,
        accent: "from-sky-50 via-cyan-50 to-white border-sky-200",
    },
    "Mind Map": {
        title: "Mind Map",
        description: "Presented as a structured topic tree.",
        icon: <GitBranch size={18} />,
        accent: "from-orange-50 via-amber-50 to-white border-orange-200",
    },
    "Reports": {
        title: "Report",
        description: "Presented as a structured notebook report.",
        icon: <FileText size={18} />,
        accent: "from-slate-50 via-zinc-50 to-white border-slate-200",
    },
    "Flashcards": {
        title: "Flashcards",
        description: "Presented as study cards for quick review.",
        icon: <Star size={18} />,
        accent: "from-violet-50 via-fuchsia-50 to-white border-violet-200",
    },
    "Quiz": {
        title: "Quiz",
        description: "Presented as multiple-choice questions.",
        icon: <HelpCircle size={18} />,
        accent: "from-emerald-50 via-lime-50 to-white border-emerald-200",
    },
};

const KNOWN_TOOLS = Object.keys(TOOL_META) as StudioToolLabel[];

const stripMarkdown = (value: string) =>
    value
        .replace(/\*\*/g, "")
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\s*>\s*/, "")
        .trim();

const stripListPrefix = (value: string) => value.replace(/^\s*[-*+]\s*/, "");

const cleanLine = (value: string) => stripMarkdown(stripListPrefix(value)).trim();

const appendText = (current: string, next: string) => (current ? `${current} ${next}`.trim() : next.trim());

const normalizeAudioContent = (content: string) =>
    content
        .replace(/\*+\s*(Host\s*\d+\s*:)/gi, "\n$1")
        .replace(/\*+\s*(\([^)]*\)|\[[^\]]*\])/g, "\n$1")
        .replace(/\)\s*(Host\s*\d+\s*:)/gi, ")\n$1")
        .replace(/\]\s*(Host\s*\d+\s*:)/gi, "]\n$1")
        .replace(/\s+(Host\s*\d+\s*:)/gi, "\n$1");

const normalizeVideoContent = (content: string) =>
    content
        .replace(/\s+(Scene\s+\d+\s*:)/gi, "\n$1")
        .replace(/\s+(Scene Description\s*:)/gi, "\n$1")
        .replace(/\s+(Key Visuals\s*:)/gi, "\n$1")
        .replace(/\s+(Narration\s*:)/gi, "\n$1");

const normalizeFlashcardContent = (content: string) =>
    content
        .replace(/\s+(Q\s*:)/gi, "\n$1")
        .replace(/\s+(A\s*:)/gi, "\n$1");

const normalizeQuizContent = (content: string) =>
    content
        .replace(/\s+((?:Question\s*)?\d+[.)]\s+)/gi, "\n$1")
        .replace(/\s+([A-D][).:-]\s+)/g, "\n$1")
        .replace(/\s+(Correct Answer\s*:)/gi, "\n$1")
        .replace(/\s+(Answer\s*:)/gi, "\n$1");

const renderParagraphs = (content: string) => (
    <div className="space-y-3 text-sm leading-6 text-slate-700">
        {content
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map((block, index) => (
                <p key={`${block.slice(0, 24)}-${index}`} className="whitespace-pre-wrap">
                    {block}
                </p>
            ))}
    </div>
);

const parseAudioSegments = (content: string): AudioSegment[] => {
    const lines = normalizeAudioContent(content)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const firstStructuredLine = lines.findIndex((line) => {
        const clean = cleanLine(line);
        return /^Host\s*\d+\s*:/i.test(clean) || /^\(.*\)$/.test(clean) || /^\[.*\]$/.test(clean);
    });

    const relevantLines = firstStructuredLine >= 0 ? lines.slice(firstStructuredLine) : lines;
    const segments: AudioSegment[] = [];

    relevantLines.forEach((rawLine) => {
        const line = cleanLine(rawLine);

        if (!line) {
            return;
        }

        const speakerMatch = line.match(/^(Host\s*\d+)\s*:\s*(.+)$/i);
        if (speakerMatch) {
            segments.push({
                type: "speaker",
                label: speakerMatch[1],
                text: speakerMatch[2].trim(),
            });
            return;
        }

        if (/^\(.*\)$/.test(line) || /^\[.*\]$/.test(line)) {
            segments.push({ type: "stage", text: line });
            return;
        }

        const lastSegment = segments[segments.length - 1];
        if (lastSegment) {
            lastSegment.text = appendText(lastSegment.text, line);
        } else {
            segments.push({ type: "narration", text: line });
        }
    });

    return segments;
};

const parseVideoScenes = (content: string): VideoScene[] => {
    const lines = normalizeVideoContent(content).split(/\r?\n/);
    const scenes: VideoScene[] = [];
    let currentScene: VideoScene | null = null;
    let activeField: keyof Pick<VideoScene, "description" | "visuals" | "narration"> | null = null;

    lines.forEach((rawLine) => {
        const line = cleanLine(rawLine);

        if (!line) {
            return;
        }

        const sceneMatch = line.match(/^Scene\s+\d+\s*:\s*(.+)$/i);
        if (sceneMatch) {
            currentScene = {
                title: sceneMatch[1].trim(),
                description: "",
                visuals: "",
                narration: "",
            };
            scenes.push(currentScene);
            activeField = null;
            return;
        }

        if (!currentScene) {
            return;
        }

        const descriptionMatch = line.match(/^Scene Description\s*:\s*(.+)$/i);
        if (descriptionMatch) {
            currentScene.description = descriptionMatch[1].trim();
            activeField = "description";
            return;
        }

        const visualsMatch = line.match(/^Key Visuals\s*:\s*(.+)$/i);
        if (visualsMatch) {
            currentScene.visuals = visualsMatch[1].trim();
            activeField = "visuals";
            return;
        }

        const narrationMatch = line.match(/^Narration\s*:\s*(.+)$/i);
        if (narrationMatch) {
            currentScene.narration = narrationMatch[1].trim();
            activeField = "narration";
            return;
        }

        if (activeField) {
            currentScene[activeField] = appendText(currentScene[activeField], line);
        }
    });

    return scenes;
};

const parseFlashcards = (content: string): Flashcard[] => {
    const lines = normalizeFlashcardContent(content).split(/\r?\n/);
    const cards: Flashcard[] = [];
    let currentCard: Flashcard | null = null;

    for (const rawLine of lines) {
        const line = cleanLine(rawLine);

        if (!line) {
            continue;
        }

        const questionMatch = line.match(/^Q\s*:\s*(.+)$/i);
        if (questionMatch) {
            if (currentCard?.question && currentCard.answer) {
                cards.push(currentCard);
            }

            currentCard = {
                question: questionMatch[1].trim(),
                answer: "",
            };
            continue;
        }

        const answerMatch = line.match(/^A\s*:\s*(.+)$/i);
        if (answerMatch && currentCard) {
            currentCard.answer = answerMatch[1].trim();
            continue;
        }

        if (currentCard) {
            if (currentCard.answer) {
                currentCard.answer = appendText(currentCard.answer, line);
            } else {
                currentCard.question = appendText(currentCard.question, line);
            }
        }
    }

    if (currentCard && currentCard.question && currentCard.answer) {
        cards.push(currentCard);
    }

    return cards;
};

const parseQuizQuestions = (content: string): QuizQuestion[] => {
    const lines = normalizeQuizContent(content).split(/\r?\n/);
    const questions: QuizQuestion[] = [];
    let currentQuestion: QuizQuestion | null = null;

    for (const rawLine of lines) {
        const line = cleanLine(rawLine);

        if (!line) {
            continue;
        }

        const questionMatch = line.match(/^(?:Question\s*)?(\d+)[.)]?\s*(.+)$/i) || line.match(/^Q(?:uestion)?\s*(\d+)\s*:\s*(.+)$/i);
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

        if (currentQuestion) {
            if (currentQuestion.options.length === 0) {
                currentQuestion.prompt = appendText(currentQuestion.prompt, line);
                continue;
            }

            const lastOption = currentQuestion.options[currentQuestion.options.length - 1];
            if (lastOption && !currentQuestion.correctAnswer) {
                lastOption.text = appendText(lastOption.text, line);
            }
        }
    }

    if (currentQuestion && currentQuestion.prompt && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
    }

    return questions;
};

const parseReportSections = (content: string): ReportSection[] => {
    const lines = content.split(/\r?\n/);
    const sections: ReportSection[] = [];
    let currentSection: ReportSection | null = null;

    lines.forEach((rawLine) => {
        const cleaned = cleanLine(rawLine);

        if (!cleaned) {
            return;
        }

        if (/^Report on /i.test(cleaned)) {
            return;
        }

        const headingMatch = rawLine.match(/^#{2,6}\s*(.+)$/) || cleaned.match(/^(Executive Summary|Key Findings|Details|Conclusion|Education|Programming Skills|Experience|Projects|Certifications|Miscellaneous|Extracurricular Experience|Extra-Curricular Achievements|Co-Curricular Achievements)$/i);

        if (headingMatch) {
            currentSection = {
                title: stripMarkdown(headingMatch[1] || headingMatch[0]),
                body: [],
            };
            sections.push(currentSection);
            return;
        }

        if (!currentSection) {
            currentSection = {
                title: "Overview",
                body: [],
            };
            sections.push(currentSection);
        }

        currentSection.body.push(rawLine);
    });

    return sections;
};

const parseMindMapNodes = (content: string): MindMapNode[] => {
    const lines = content.split(/\r?\n/);
    const nodes: MindMapNode[] = [];

    lines.forEach((rawLine) => {
        if (!rawLine.trim()) {
            return;
        }

        const cleaned = cleanLine(rawLine);
        if (!cleaned || /^Mind Map/i.test(cleaned) || /^Here is/i.test(cleaned)) {
            return;
        }

        const leadingWhitespace = rawLine.match(/^\s*/)?.[0].replace(/\t/g, "    ").length || 0;
        const startsAsBullet = /^\s*[-*+]/.test(rawLine);
        const depth = nodes.length === 0 ? 0 : startsAsBullet ? Math.max(1, Math.floor(leadingWhitespace / 2) + 1) : Math.floor(leadingWhitespace / 2);

        nodes.push({
            text: cleaned,
            depth,
        });
    });

    return nodes;
};

const ToolShell = ({
    tool,
    children,
    className,
}: {
    tool: StudioToolLabel;
    children: ReactNode;
    className?: string;
}) => {
    const meta = TOOL_META[tool];

    return (
        <Card className={cn("w-full overflow-hidden border bg-gradient-to-br shadow-md", meta.accent, className)}>
            <CardHeader className="gap-2 border-b border-black/5 pb-4">
                <div className="flex items-center gap-2 text-slate-700">
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/80 shadow-sm">
                        {meta.icon}
                    </span>
                    <div>
                        <CardTitle>{meta.title}</CardTitle>
                        <CardDescription>{meta.description}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-4">{children}</CardContent>
        </Card>
    );
};

const buildAudioPlaybackQueue = (segments: AudioSegment[]) =>
    segments
        .filter((segment) => segment.type !== "stage")
        .map((segment) => {
            if (segment.type === "speaker" && segment.label) {
                return {
                    text: `${segment.label}. ${segment.text}`,
                    pitch: segment.label.toLowerCase().includes("2") ? 1.12 : 1,
                };
            }

            return {
                text: segment.text,
                pitch: 1,
            };
        })
        .filter((segment) => segment.text.trim().length > 0);

const AudioOverviewCard = ({ content }: { content: string }) => {
    const segments = parseAudioSegments(content);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);

    useEffect(() => {
        setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    }, []);

    useEffect(() => {
        if (!speechSupported || typeof window === "undefined") {
            return;
        }

        return () => {
            window.speechSynthesis.cancel();
        };
    }, [speechSupported]);

    useEffect(() => {
        if (!speechSupported || typeof window === "undefined") {
            return;
        }

        window.speechSynthesis.cancel();
        utterancesRef.current = [];
        setIsPlaying(false);
    }, [content, speechSupported]);

    const handleToggleAudio = () => {
        if (!speechSupported || typeof window === "undefined") {
            return;
        }

        const synth = window.speechSynthesis;

        if (isPlaying) {
            synth.cancel();
            utterancesRef.current = [];
            setIsPlaying(false);
            return;
        }

        const playbackQueue = buildAudioPlaybackQueue(segments);
        if (playbackQueue.length === 0) {
            return;
        }

        synth.cancel();
        setIsPlaying(true);

        utterancesRef.current = playbackQueue.map((segment, index) => {
            const utterance = new SpeechSynthesisUtterance(segment.text);
            utterance.rate = 1;
            utterance.pitch = segment.pitch;
            utterance.onend = () => {
                if (index === playbackQueue.length - 1) {
                    setIsPlaying(false);
                }
            };
            utterance.onerror = () => {
                setIsPlaying(false);
            };
            return utterance;
        });

        utterancesRef.current.forEach((utterance) => synth.speak(utterance));
    };

    if (segments.length === 0) {
        return <ToolShell tool="Audio Overview">{renderParagraphs(content)}</ToolShell>;
    }

    return (
        <ToolShell tool="Audio Overview">
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white/85 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-900">Listen in browser</p>
                    <p className="text-xs leading-5 text-slate-600">
                        {speechSupported
                            ? "Play this overview as browser-generated speech."
                            : "Speech playback is not available in this browser."}
                    </p>
                </div>
                <Button
                    type="button"
                    variant={isPlaying ? "secondary" : "default"}
                    onClick={handleToggleAudio}
                    disabled={!speechSupported}
                    className="rounded-full"
                >
                    {isPlaying ? <Pause size={16} /> : <Volume2 size={16} />}
                    {isPlaying ? "Stop Audio" : "Play Audio"}
                </Button>
            </div>
            <div className="space-y-3">
                {segments.map((segment, index) => {
                    if (segment.type === "stage") {
                        return (
                            <div key={`${segment.text.slice(0, 24)}-${index}`} className="rounded-xl bg-white/70 px-4 py-3 text-center text-xs italic text-slate-500">
                                {segment.text}
                            </div>
                        );
                    }

                    if (segment.type === "speaker") {
                        return (
                            <div key={`${segment.label}-${index}`} className="rounded-2xl bg-white/90 p-4 shadow-sm">
                                <div className="mb-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                                    {segment.label}
                                </div>
                                <p className="text-sm leading-6 text-slate-700">{segment.text}</p>
                            </div>
                        );
                    }

                    return (
                        <div key={`${segment.text.slice(0, 24)}-${index}`} className="rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-700 shadow-sm">
                            {segment.text}
                        </div>
                    );
                })}
            </div>
        </ToolShell>
    );
};

const VideoOverviewCard = ({ content }: { content: string }) => {
    const scenes = parseVideoScenes(content);
    const [activeSceneIndex, setActiveSceneIndex] = useState(0);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    useEffect(() => {
        setActiveSceneIndex(0);
        setIsPreviewPlaying(false);
    }, [content]);

    useEffect(() => {
        if (!isPreviewPlaying || scenes.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setActiveSceneIndex((currentIndex) => (currentIndex + 1) % scenes.length);
        }, 5000);

        return () => window.clearInterval(intervalId);
    }, [isPreviewPlaying, scenes.length]);

    if (scenes.length === 0) {
        return <ToolShell tool="Video Overview">{renderParagraphs(content)}</ToolShell>;
    }

    const activeScene = scenes[activeSceneIndex];

    return (
        <ToolShell tool="Video Overview">
            <div className="mb-4 rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Storyboard Preview</p>
                        <p className="text-xs leading-5 text-slate-600">
                            This is a scene player for the video outline. It is not an exported video file yet.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setIsPreviewPlaying(false);
                                setActiveSceneIndex((currentIndex) => (currentIndex === 0 ? scenes.length - 1 : currentIndex - 1));
                            }}
                            className="rounded-full"
                        >
                            <SkipBack size={14} />
                            Prev
                        </Button>
                        <Button
                            type="button"
                            variant={isPreviewPlaying ? "secondary" : "default"}
                            size="sm"
                            onClick={() => setIsPreviewPlaying((currentValue) => !currentValue)}
                            className="rounded-full"
                        >
                            {isPreviewPlaying ? <Pause size={14} /> : <Play size={14} />}
                            {isPreviewPlaying ? "Pause Preview" : "Play Preview"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setIsPreviewPlaying(false);
                                setActiveSceneIndex((currentIndex) => (currentIndex + 1) % scenes.length);
                            }}
                            className="rounded-full"
                        >
                            Next
                            <SkipForward size={14} />
                        </Button>
                    </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-inner">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-100">
                            Scene {activeSceneIndex + 1} of {scenes.length}
                        </span>
                        <span className="text-xs text-sky-100/80">{isPreviewPlaying ? "Auto-advancing every 5s" : "Manual preview"}</span>
                    </div>
                    <h3 className="text-lg font-semibold">{activeScene.title}</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl bg-white/10 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-100/80">Scene Description</p>
                            <p className="text-sm leading-6 text-white/90">{activeScene.description || "Not provided."}</p>
                        </div>
                        <div className="rounded-xl bg-white/10 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-100/80">Key Visuals</p>
                            <p className="text-sm leading-6 text-white/90">{activeScene.visuals || "Not provided."}</p>
                        </div>
                        <div className="rounded-xl bg-white/10 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-100/80">Narration</p>
                            <p className="text-sm leading-6 text-white/90">{activeScene.narration || "Not provided."}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {scenes.map((scene, index) => (
                        <button
                            key={`${scene.title}-${index}-tab`}
                            type="button"
                            onClick={() => {
                                setIsPreviewPlaying(false);
                                setActiveSceneIndex(index);
                            }}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                                index === activeSceneIndex
                                    ? "border-sky-300 bg-sky-100 text-sky-900"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            Scene {index + 1}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-4">
                {scenes.map((scene, index) => (
                    <div key={`${scene.title}-${index}`} className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900">Scene {index + 1}: {scene.title}</h3>
                            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700">Explainer Scene</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Scene Description</p>
                                <p className="text-sm leading-6 text-slate-700">{scene.description || "Not provided."}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Visuals</p>
                                <p className="text-sm leading-6 text-slate-700">{scene.visuals || "Not provided."}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Narration</p>
                                <p className="text-sm leading-6 text-slate-700">{scene.narration || "Not provided."}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
};

const FlashcardsCard = ({ content }: { content: string }) => {
    const flashcards = parseFlashcards(content);

    if (flashcards.length === 0) {
        return <ToolShell tool="Flashcards">{renderParagraphs(content)}</ToolShell>;
    }

    return (
        <ToolShell tool="Flashcards">
            <div className="grid gap-4 md:grid-cols-2">
                {flashcards.map((card, index) => (
                    <div
                        key={`${card.question.slice(0, 24)}-${index}`}
                        className="overflow-hidden rounded-2xl border border-violet-100 bg-white/95 shadow-sm"
                    >
                        <div className="border-b border-violet-100 bg-violet-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Flashcard {index + 1}</p>
                            <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{card.question}</p>
                        </div>
                        <div className="px-4 py-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Answer</p>
                            <p className="text-sm leading-6 text-slate-700">{card.answer}</p>
                        </div>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
};

const QuizCard = ({ content }: { content: string }) => {
    const questions = parseQuizQuestions(content);

    if (questions.length === 0) {
        return <ToolShell tool="Quiz">{renderParagraphs(content)}</ToolShell>;
    }

    return (
        <ToolShell tool="Quiz">
            <div className="space-y-4">
                {questions.map((question, index) => (
                    <div key={`${question.prompt.slice(0, 24)}-${index}`} className="rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <h3 className="text-sm font-semibold leading-6 text-slate-900">
                                {index + 1}. {question.prompt}
                            </h3>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Multiple Choice</span>
                        </div>
                        <div className="space-y-2">
                            {question.options.map((option) => {
                                const isCorrect = option.label === question.correctAnswer;

                                return (
                                    <div
                                        key={`${option.label}-${option.text.slice(0, 16)}`}
                                        className={cn(
                                            "flex items-start gap-3 rounded-xl border px-3 py-2 text-sm",
                                            isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                                isCorrect ? "bg-emerald-200 text-emerald-900" : "bg-white text-slate-600"
                                            )}
                                        >
                                            {option.label}
                                        </span>
                                        <span className="leading-6">{option.text}</span>
                                    </div>
                                );
                            })}
                        </div>
                        {question.correctAnswer && (
                            <div className="mt-3 text-xs font-medium text-emerald-700">
                                Correct answer: {question.correctAnswer}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </ToolShell>
    );
};

const ReportCard = ({ content }: { content: string }) => {
    const sections = parseReportSections(content);

    if (sections.length === 0) {
        return <ToolShell tool="Reports">{renderParagraphs(content)}</ToolShell>;
    }

    return (
        <ToolShell tool="Reports">
            <div className="space-y-4">
                {sections.map((section, index) => (
                    <div key={`${section.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">{section.title}</h3>
                        <div className="space-y-2 text-sm leading-6 text-slate-700">
                            {section.body.map((line, lineIndex) => {
                                const cleaned = cleanLine(line);

                                if (!cleaned) {
                                    return null;
                                }

                                if (/^\s*[-*+]/.test(line)) {
                                    return (
                                        <div key={`${cleaned.slice(0, 24)}-${lineIndex}`} className="flex items-start gap-2">
                                            <span className="mt-2 size-1.5 rounded-full bg-slate-400" />
                                            <span>{cleaned}</span>
                                        </div>
                                    );
                                }

                                const subHeadingMatch = line.match(/^#{3,6}\s*(.+)$/);
                                if (subHeadingMatch) {
                                    return (
                                        <h4 key={`${cleaned.slice(0, 24)}-${lineIndex}`} className="pt-2 text-sm font-semibold text-slate-900">
                                            {stripMarkdown(subHeadingMatch[1])}
                                        </h4>
                                    );
                                }

                                return (
                                    <p key={`${cleaned.slice(0, 24)}-${lineIndex}`} className="whitespace-pre-wrap">
                                        {cleaned}
                                    </p>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </ToolShell>
    );
};

const MindMapCard = ({ content }: { content: string }) => {
    const nodes = parseMindMapNodes(content);

    if (nodes.length === 0) {
        return <ToolShell tool="Mind Map">{renderParagraphs(content)}</ToolShell>;
    }

    const [centralTopic, ...branches] = nodes;

    return (
        <ToolShell tool="Mind Map">
            <div className="space-y-3">
                <div className="rounded-2xl bg-orange-100 px-4 py-4 text-center shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Central Topic</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{centralTopic.text}</p>
                </div>
                <div className="space-y-2">
                    {branches.map((node, index) => (
                        <div
                            key={`${node.text.slice(0, 24)}-${index}`}
                            className="flex items-center gap-3 rounded-xl bg-white/90 px-3 py-2 shadow-sm"
                            style={{ marginLeft: `${node.depth * 18}px` }}
                        >
                            <span className={cn("size-2 rounded-full", node.depth <= 1 ? "bg-orange-400" : node.depth === 2 ? "bg-amber-400" : "bg-slate-400")} />
                            <span className="text-sm text-slate-700">{node.text}</span>
                        </div>
                    ))}
                </div>
            </div>
        </ToolShell>
    );
};

const GenericToolCard = ({ tool, content }: { tool: StudioToolLabel; content: string }) => (
    <ToolShell tool={tool}>{renderParagraphs(content)}</ToolShell>
);

const normalizeToolLabel = (value: string): StudioToolLabel | null =>
    KNOWN_TOOLS.find((tool) => tool.toLowerCase() === value.trim().toLowerCase()) || null;

const ToolResponseRenderer = ({ toolUsed, content }: ToolResponseRendererProps) => {
    const normalizedTool = normalizeToolLabel(toolUsed);

    if (!normalizedTool) {
        return renderParagraphs(content);
    }

    switch (normalizedTool) {
        case "Audio Overview":
            return <AudioOverviewCard content={content} />;
        case "Video Overview":
            return <VideoOverviewCard content={content} />;
        case "Flashcards":
            return <FlashcardsCard content={content} />;
        case "Quiz":
            return <QuizCard content={content} />;
        case "Reports":
            return <ReportCard content={content} />;
        case "Mind Map":
            return <MindMapCard content={content} />;
        default:
            return <GenericToolCard tool={normalizedTool} content={content} />;
    }
};

export default ToolResponseRenderer;
