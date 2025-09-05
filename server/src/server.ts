import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import mongoose, { Schema, type InferSchemaType } from "mongoose";
import OpenAI from "openai";
import { getContext } from "./rag";

// ==== Mongo ====
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/thunder_chat";

const ConversationSchema = new Schema({
    title: String,
    model: String,
    summary: { type: String, default: "" },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() }
});
const MessageSchema = new Schema({
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    role: { type: String, enum: ["user", "assistant", "system"] },
    content: String,
    createdAt: { type: Number, default: () => Date.now() }
});

type Conversation = InferSchemaType<typeof ConversationSchema> & { _id: any };
const ConversationModel = mongoose.model("Conversation", ConversationSchema);
const MessageModel = mongoose.model("Message", MessageSchema);

// ==== OpenRouter ====
const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: { "HTTP-Referer": "http://localhost", "X-Title": "Thunder Chat" }
});
const CHAT_MODEL = "google/gemini-flash-1.5";

async function summarize(history: { role: string; content: string }[]) {
    const r = await client.chat.completions.create({
        model: CHAT_MODEL,
        temperature: 0.2,
        messages: [
            { role: "system", content: "Fii foarte scurt. Rezumă dialogul de mai jos pentru memorie." },
            { role: "user", content: history.map(m => `[${m.role}]: ${m.content}`).join("\n") }
        ]
    });
    return r.choices?.[0]?.message?.content ?? "";
}

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get("/api/health", (_req: Request, res: Response) => res.json({ ok: true }));

// list convs
app.get("/api/conversations", async (_req: Request, res: Response) => {
    const convs = await ConversationModel.find().sort({ updatedAt: -1 }).lean();
    res.json(convs);
});

// get conv + messages
app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    const c = await ConversationModel.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "not found" });
    const msgs = await MessageModel.find({ conversationId: c._id }).sort({ createdAt: 1 }).lean();
    res.json({ conversation: c, messages: msgs });
});

// create conv
app.post("/api/conversations", async (req: Request, res: Response) => {
    const title = (req.body?.title as string | undefined) ?? "Nou";
    const c = await ConversationModel.create({ title, model: CHAT_MODEL });
    res.json(c);
});

interface ChatBody {
    conversationId?: string;
    message: string;
}

// chat
app.post("/api/chat", async (req: Request<unknown, unknown, ChatBody>, res: Response) => {
    try {
        const { conversationId, message } = req.body;

        let conv: Conversation | null = null;
        if (conversationId) conv = await ConversationModel.findById(conversationId);
        if (!conv) conv = await ConversationModel.create({ title: message.slice(0, 40), model: CHAT_MODEL });

        await MessageModel.create({ conversationId: conv._id, role: "user", content: message });
        await ConversationModel.updateOne({ _id: conv._id }, { $set: { updatedAt: Date.now() } });

        const msgs = await MessageModel.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean();
        const last = msgs.slice(-30).map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content ?? "" }));

        const preface = conv.summary ? [{ role: "system" as const, content: `Rezumat anterior: ${conv.summary}` }] : [];

        const { context } = await getContext(message);
        const userContent = context ? `${context}\nÎntrebare: ${message}\nRăspuns:` : message;

        const completion = await client.chat.completions.create({
            model: CHAT_MODEL,
            temperature: 0.3,
            messages: [
                { role: "system", content: "Ești un asistent util. Dacă primești context, răspunde strict pe baza lui; altfel răspunde general, concis." },
                ...preface,
                ...last,
                { role: "user", content: userContent }
            ]
        });

        const reply = completion.choices?.[0]?.message?.content ?? "(fără răspuns)";
        await MessageModel.create({ conversationId: conv._id, role: "assistant", content: reply });
        await ConversationModel.updateOne({ _id: conv._id }, { $set: { updatedAt: Date.now() } });

        if (last.length > 24) {
            const summary = await summarize(last.slice(0, last.length - 10));
            if (summary) await ConversationModel.updateOne({ _id: conv._id }, { $set: { summary } });
        }

        res.json({ conversationId: conv._id.toString(), reply });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e?.message ?? "error" });
    }
});

async function start() {
    await mongoose.connect(MONGODB_URI);
    const port = Number(process.env.PORT ?? 3001);
    app.listen(port, () => console.log(`API on http://localhost:${port}`));
}
start().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
