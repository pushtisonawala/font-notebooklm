// MiddlePannel.jsx
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { SendHorizonal } from "lucide-react";
import { useState } from "react";
import { apiUrl } from "@/config/get-env";
import { getUserData } from "@/helper/getUserData";

type SelectedSource = {
    noteId?: string;
};


const MiddlePannel = () => {

    const { middlePanelDefaultWidth, selectedFiles } = useSelector((state: RootState) => state.chat);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([
        { role: "assistant", content: "Hello! I’m your AI assistant. How can I help you today?" },
    ]);


    const selectedSources = selectedFiles as SelectedSource[];

    return (
        <div
            style={{
                width: `${middlePanelDefaultWidth}%`
            }}
            className={
                `bg-white transition-all duration-300 shadow-md rounded-md h-full  p-4 flex flex-col`
            }>

            {/* chat section */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm shadow ${
                                msg.role === "user"
                                    ? "bg-indigo-500 text-white rounded-br-none"
                                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                            }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>



            <div className="relative border border-gray-200 rounded-2xl p-3 bg-white">
                panel:{middlePanelDefaultWidth}
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={selectedFiles?.length > 0 ? "Start typing..." : "Select sources to chat"}
                        className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400 px-2 py-2"
                        aria-label="Message input"
                        disabled={!selectedFiles || selectedFiles.length === 0}
                    />

                    <div className="text-xs text-gray-500 whitespace-nowrap">
                        {selectedFiles?.length || 0} source{selectedFiles?.length === 1 ? '' : 's'}
                    </div>

                    <button
                        aria-label="Send"
                        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition ${selectedFiles && selectedFiles.length > 0 && input.trim() ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-gray-300 cursor-not-allowed'}`}
                        title="Send"
                        disabled={!selectedFiles || selectedFiles.length === 0 || !input.trim()}
                        onClick={async () => {
                            setMessages(prev => [...prev, { role: "user", content: input }]);
                            const userMessage = input;
                            setInput("");
                            // Send to backend using the first selected file's noteId (for now, single note context)
                            const noteId = selectedSources[0]?.noteId;
                            if (!noteId) {
                                setMessages(prev => [...prev, { role: "assistant", content: "[Error: No note is selected for this chat.]" }]);
                                return;
                            }
                            const userData = getUserData();
                            try {
                                const res = await fetch(`${apiUrl}/api/v1/chat/${noteId}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: "include",
                                    body: JSON.stringify({
                                        message: userMessage,
                                        userId: userData?._id,
                                    }),
                                });
                                if (!res.ok) {
                                    const err = await res.json();
                                    const errorMessage = [err.error, err.details].filter(Boolean).join(" ");
                                    setMessages(prev => [...prev, { role: "assistant", content: `[Error: ${errorMessage || 'Failed to get response'}]` }]);
                                    return;
                                }
                                const data = await res.json();
                                setMessages(prev => [...prev, { role: "assistant", content: data.message || '[No response from AI]' }]);
                            } catch (err) {
                                const networkMessage = err instanceof Error ? err.message : "Unknown network error";
                                setMessages(prev => [...prev, { role: "assistant", content: `[Network error: ${networkMessage}]` }]);
                            }
                        }}
                    >
                        <SendHorizonal className="text-white " size={16} />
                    </button>
                </div>



            </div>
        </div>
    );
};

export default MiddlePannel;
