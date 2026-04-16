import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";
import { LoaderCircle, SendHorizonal, X } from "lucide-react";
import { useState } from "react";
import { apiUrl } from "@/config/get-env";
import { getUserData } from "@/helper/getUserData";
import { getStudioToolDefaultPrompt, STUDIO_TOOLS } from "@/config/studio-tools";
import { setActiveStudioTool } from "@/store/chatSlice";
import ToolResponseRenderer from "@/components/chat/ToolResponseRenderer";

type SelectedSource = {
    noteId?: string;
};

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    toolUsed?: string | null;
};

const MiddlePannel = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { middlePanelDefaultWidth, selectedFiles, activeStudioTool } = useSelector((state: RootState) => state.chat);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: "Hello! I'm your notebook assistant. Ask a question or choose a Studio tool." },
    ]);

    const selectedSources = selectedFiles as SelectedSource[];
    const trimmedInput = input.trim();
    const fallbackPrompt = getStudioToolDefaultPrompt(activeStudioTool);
    const messageToSend = trimmedInput || fallbackPrompt;
    const canSend = selectedFiles.length > 0 && Boolean(messageToSend) && !isSending;
    const activeTool = STUDIO_TOOLS.find((tool) => tool.label === activeStudioTool);

    const handleSend = async () => {
        if (!canSend) {
            return;
        }

        const noteId = selectedSources[0]?.noteId;
        if (!noteId) {
            setMessages((prev) => [...prev, { role: "assistant", content: "[Error: No note is selected for this chat.]" }]);
            return;
        }

        setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
        setInput("");
        setIsSending(true);

        const userData = getUserData();

        try {
            const res = await fetch(`${apiUrl}/api/v1/chat/${noteId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    message: messageToSend,
                    userId: userData?._id,
                    selectedTool: activeStudioTool,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                const errorMessage = [err.error, err.details].filter(Boolean).join(" ");
                setMessages((prev) => [...prev, { role: "assistant", content: `[Error: ${errorMessage || "Failed to get response"}]` }]);
                return;
            }

            const data = await res.json();
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: data.message || "[No response from AI]",
                    toolUsed: data.toolUsed || null,
                },
            ]);
        } catch (err) {
            const networkMessage = err instanceof Error ? err.message : "Unknown network error";
            setMessages((prev) => [...prev, { role: "assistant", content: `[Network error: ${networkMessage}]` }]);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div
            style={{
                width: `${middlePanelDefaultWidth}%`
            }}
            className="bg-white transition-all duration-300 shadow-md rounded-md h-full p-4 flex flex-col"
        >
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                {messages.map((msg, idx) => {
                    const shouldUseToolRenderer = msg.role === "assistant" && Boolean(msg.toolUsed) && !msg.content.startsWith("[Error:");

                    return (
                        <div
                            key={`${msg.role}-${idx}`}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div className={shouldUseToolRenderer ? "max-w-[92%] w-full" : "max-w-[70%]"}>
                                {shouldUseToolRenderer ? (
                                    <ToolResponseRenderer toolUsed={msg.toolUsed || ""} content={msg.content} />
                                ) : (
                                    <div
                                        className={`px-4 py-2 rounded-2xl text-sm shadow whitespace-pre-wrap ${
                                            msg.role === "user"
                                                ? "bg-indigo-500 text-white rounded-br-none"
                                                : "bg-gray-100 text-gray-800 rounded-bl-none"
                                        }`}
                                    >
                                        {msg.content}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isSending && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-none bg-gray-100 px-4 py-3 text-sm text-gray-700 shadow">
                            <div className="flex items-center gap-2">
                                <LoaderCircle size={16} className="animate-spin" />
                                <span>Generating response...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="relative border border-gray-200 rounded-2xl p-3 bg-white">
                {activeStudioTool && (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                        <span>{activeStudioTool} selected. Send with no text to run it directly, or add extra instructions.</span>
                        <button
                            type="button"
                            onClick={() => dispatch(setActiveStudioTool(null))}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:bg-indigo-100"
                        >
                            <X size={14} />
                            Clear
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                void handleSend();
                            }
                        }}
                        placeholder={
                            selectedFiles.length > 0
                                ? activeTool
                                    ? `Run ${activeTool.shortLabel.toLowerCase()} or add extra instructions`
                                    : "Ask about your notebook..."
                                : "Select sources to chat"
                        }
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400 px-2 py-2"
                        aria-label="Message input"
                        disabled={selectedFiles.length === 0 || isSending}
                    />

                    <div className="text-xs text-gray-500 whitespace-nowrap">
                        {selectedFiles.length} source{selectedFiles.length === 1 ? "" : "s"}
                    </div>

                    <button
                        aria-label="Send"
                        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition ${
                            canSend ? "bg-indigo-500 hover:bg-indigo-600" : "bg-gray-300 cursor-not-allowed"
                        }`}
                        title="Send"
                        disabled={!canSend}
                        onClick={() => void handleSend()}
                    >
                        {isSending ? <LoaderCircle className="text-white animate-spin" size={16} /> : <SendHorizonal className="text-white" size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MiddlePannel;
