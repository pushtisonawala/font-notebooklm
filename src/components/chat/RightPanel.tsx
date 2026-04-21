
import { PanelRight, Sparkles, Video, GitBranch, FileText, Star, HelpCircle, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";
import { addExtraWidth, reduceExtraWidth, setActiveStudioTool, toggleRightPanel } from "@/store/chatSlice";
import { STUDIO_TOOLS, type StudioToolLabel } from "@/config/studio-tools";
import { useNavigate } from "react-router";

const TOOL_ICONS: Record<StudioToolLabel, ReactNode> = {
    "Audio Overview": <Sparkles />,
    "Video Overview": <Video />,
    "Mind Map": <GitBranch />,
    "Reports": <FileText />,
    "Flashcards": <Star />,
    "Quiz": <HelpCircle />,
};

const RightPanel = () => {

    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { rightPanelOpen, activeStudioTool, selectedFiles } = useSelector((state: RootState) => state.chat);
    const noteId = (selectedFiles[0] as { noteId?: string } | undefined)?.noteId;

    const openQuizPage = () => {
        dispatch(setActiveStudioTool(null));
        navigate(noteId ? `/quiz?noteId=${noteId}` : "/quiz");
    };

    const handleToolClick = (toolLabel: StudioToolLabel) => {
        if (toolLabel === "Quiz") {
            openQuizPage();
            return;
        }

        dispatch(setActiveStudioTool(activeStudioTool === toolLabel ? null : toolLabel));
    };

    function togglePanel() {
        if (rightPanelOpen) {
            dispatch(addExtraWidth())
            dispatch(toggleRightPanel())

        } else {

            dispatch(reduceExtraWidth())
            dispatch(toggleRightPanel())
        }

    }

    return (
        <div
            className={`bg-white shadow-md rounded-sm h-full transition-all duration-300 ml-auto ${rightPanelOpen ? "w-[25%] p-4" : "w-16 p-2"
                }`}
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                {rightPanelOpen && <p className="text-base text-gray-800">Studio</p>}
                <Button
                    variant="link"
                    size="icon"
                    className="size-8 hover:bg-slate-100 cursor-pointer"
                    onClick={() => togglePanel()}
                >
                    <PanelRight size={52} />
                </Button>
            </div>
            <hr />

            {/* Content */}
            <div className={`mt-4 grid ${rightPanelOpen ? "grid-cols-2 gap-4" : "grid-cols-1 gap-3"}`}>
                {STUDIO_TOOLS.map((tool) => (
                    <PanelItem
                        key={tool.label}
                        rightPanelOpen={rightPanelOpen}
                        icon={TOOL_ICONS[tool.label]}
                        label={tool.label}
                        isActive={tool.label === "Quiz" ? false : activeStudioTool === tool.label}
                        onClick={() => handleToolClick(tool.label)}
                    />
                ))}
            </div>

            {rightPanelOpen && (
                <button
                    type="button"
                    onClick={openQuizPage}
                    className="mt-6 w-full rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-fuchsia-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Quiz Arena</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">Open adaptive quiz mode</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                {noteId
                                    ? "Use the latest saved quiz for the selected notebook."
                                    : "Pick a source first, then launch the immersive quiz page."}
                            </p>
                        </div>
                        <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
                            /quiz
                        </div>
                    </div>
                </button>
            )}

            {/* Bottom note button */}
            <div className="mt-6 flex justify-center">
                <Button
                    className={`flex items-center gap-2 rounded-full font-medium shadow-md ${rightPanelOpen ? "px-6 py-3" : "p-3"
                        }`}
                >
                    <Pencil size={18} />
                    {rightPanelOpen && <span>Add note</span>}
                </Button>
            </div>
        </div>

    );
};

const PanelItem = ({
    icon,
    label,
    rightPanelOpen,
    isActive,
    onClick,
}: {
    icon: ReactNode;
    label: StudioToolLabel;
    rightPanelOpen: boolean;
    isActive: boolean;
    onClick: () => void;
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={isActive}
            className={`flex items-center justify-center rounded-md border cursor-pointer transition text-left ${
                rightPanelOpen ? "flex-col p-4 h-24" : "p-2 h-14"
            } ${
                isActive
                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                    : label === "Mind Map"
                        ? "bg-orange-50 border-orange-100 hover:bg-orange-100"
                        : "bg-gray-100 border-transparent hover:bg-gray-200"
            }`}
        >
            {icon}
            {rightPanelOpen && <span className="mt-2 text-sm font-medium text-gray-700">{label}</span>}
        </button>
    );
};

export default RightPanel;
