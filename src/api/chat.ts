import { makeHttpReq } from "@/helper/makeHttpReq";

export type StoredChatMessage = {
  _id?: string;
  noteId?: string;
  userId?: string;
  role: "user" | "assistant";
  content: string;
  toolUsed?: string | null;
  createdAt?: string;
};

export type ChatHistoryResponse = {
  messages: StoredChatMessage[];
  count: number;
};

export async function getChatHistory(noteId: string): Promise<ChatHistoryResponse> {
  const data = await makeHttpReq("GET", `chat/${noteId}`) as ChatHistoryResponse;
  return data;
}
