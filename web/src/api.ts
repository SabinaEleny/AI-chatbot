const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export type Conversation = {
    _id: string; title?: string; model?: string; updatedAt?: number;
};
export type Message = { role: "user" | "assistant" | "system"; content: string; createdAt?: number };

export async function listConversations(): Promise<Conversation[]> {
    const r = await fetch(`${BASE}/api/conversations`);
    return r.json();
}

export async function getConversation(id: string): Promise<{conversation: Conversation; messages: Message[]}> {
    const r = await fetch(`${BASE}/api/conversations/${id}`);
    return r.json();
}

export async function createConversation(title?: string): Promise<Conversation> {
    const r = await fetch(`${BASE}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
    });
    return r.json();
}

export async function sendMessage(body: { conversationId?: string; message: string })
    : Promise<{ conversationId: string; reply: string }> {
    const r = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return r.json();
}
