import { useEffect, useRef, useState } from "react";
import {
    listConversations,
    getConversation,
    createConversation,
    sendMessage,
    type Conversation,
    type Message,
} from "./api";

export default function App() {
    const [convs, setConvs] = useState<Conversation[]>([]);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        (async () => setConvs(await listConversations()))();
    }, []);

    async function openConv(id: string) {
        setCurrentId(id);
        const { messages } = await getConversation(id);
        setMessages(messages);
        scrollToBottom();
    }

    async function newConv() {
        const c = await createConversation("New Conversation");
        setConvs((prev) => [c, ...prev]);
        await openConv(c._id);
    }

    async function onSend() {
        if (!input.trim()) return;
        setLoading(true);

        const userMsg: Message = { role: "user", content: input };
        setMessages((m) => [...m, userMsg]);
        setInput("");

        try {
            const { conversationId, reply } = await sendMessage({
                conversationId: currentId ?? undefined,
                message: userMsg.content,
            });

            if (!currentId) {
                setCurrentId(conversationId);
                setConvs((prev) =>
                    prev.some((x) => x._id === conversationId)
                        ? prev
                        : [{ _id: conversationId, title: userMsg.content.slice(0, 40) }, ...prev]
                );
            }

            setMessages((m) => [...m, { role: "assistant", content: reply }]);
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    }

    function scrollToBottom() {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    }

    return (
        <div className="h-screen grid grid-cols-[260px_1fr] bg-[var(--background)] text-[var(--foreground)]">
            {/* Sidebar */}
            <aside className="border-r border-[var(--border)] bg-[var(--background-dark)] p-3 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <h1 className="font-semibold text-lg">Thunder Chat</h1>
                </div>

                <button
                    onClick={newConv}
                    className="mb-3 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] py-2 px-3 text-sm shadow-sm transition
                     hover:bg-[var(--accent)]"
                >
                    + New Conversation
                </button>

                <div className="overflow-auto space-y-2">
                    {convs.map((c) => (
                        <button
                            key={c._id}
                            onClick={() => openConv(c._id)}
                            className={`w-full text-left p-3 rounded-lg border transition
                ${currentId === c._id
                                ? "border-[var(--accent)] bg-[var(--card)]"
                                : "border-[var(--border)] bg-[var(--background-dark)] hover:brightness-110"}`}
                        >
                            <div className="font-medium truncate">
                                {c.title || "No title"}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                                {new Date(c.updatedAt ?? Date.now()).toLocaleString()}
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* Chat area */}
            <main className="flex flex-col h-full">
                <header className="border-b border-[var(--border)] bg-[var(--background-dark)] p-3">
                    <div className="font-medium">
                        {currentId ? "Chat" : "Select or create a new conversation"}
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-4 space-y-3 bg-[var(--background)]">
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[750px] px-4 py-2 rounded-2xl shadow-sm text-sm whitespace-pre-wrap border
                ${m.role === "user"
                                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent rounded-br-sm"
                                    : "bg-[var(--card)] text-[var(--card-foreground)] border-[var(--border)] rounded-bl-sm"}`}
                            >
                                {m.content}
                            </div>
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>

                <footer className="border-t border-[var(--border)] bg-[var(--background-dark)] p-3">
                    <div className="flex gap-2">
                        <input
                            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]
                         px-4 py-2 outline-none focus:ring-2 ring-[var(--ring)] placeholder:text-[var(--muted-foreground)]"
                            placeholder="Ask anything…"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => (e.key === "Enter" && !e.shiftKey ? onSend() : undefined)}
                        />
                        <button
                            disabled={loading || !input.trim()}
                            onClick={onSend}
                            className="rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 transition
                         hover:bg-[var(--accent)] disabled:opacity-60"
                        >
                            {loading ? "..." : "Send"}
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
}
