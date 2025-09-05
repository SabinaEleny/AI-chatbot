import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { pipeline } from "@xenova/transformers";

const FAISS_DIR = "../thunder_db";
const EMB_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

const CANDIDATE_K = 12;
const TOP_K = 6;
const SCORE_MODE: "distance" | "similarity" = "distance";
const MAX_DISTANCE = 1.6;
const KEYWORD_ALPHA = 0.08;

let store: FaissStore | null = null;
let extractor: any;

const embeddings = {
    embedDocuments: async (texts: string[]) => {
        if (!extractor) extractor = await pipeline("feature-extraction", EMB_MODEL);
        const out: number[][] = [];
        for (const t of texts) {
            const r = await extractor(t, { pooling: "mean", normalize: true });
            out.push(Array.from(r.data as Float32Array));
        }
        return out;
    },
    embedQuery: async (t: string) => (await embeddings.embedDocuments([t]))[0],
} as any;

function keywordBoost(q: string, text: string) {
    const query = q.toLowerCase(), t = (text || "").toLowerCase();
    const toks = Array.from(new Set(query.split(/\W+/).filter(w => w.length > 3)));
    let s = 0;
    for (const w of toks) s += (t.match(new RegExp(`\\b${w}\\b`, "g")) || []).length;
    if (t.includes("proiectul phoenix")) s += 5;
    if (t.includes("descriere:")) s += 2;
    if (t.includes("status:")) s += 2;
    if (t.includes("echipa alocata") || t.includes("echipă alocată")) s += 2;
    return s;
}
const rankKey = (score: number, kw: number) =>
    SCORE_MODE === "distance" ? score - KEYWORD_ALPHA * kw : -score - KEYWORD_ALPHA * kw;
const rawGate = (best: number) => SCORE_MODE === "distance" ? best <= MAX_DISTANCE : best >= 0.3;
const fmt = (s: number) => SCORE_MODE === "distance" ? `dist ${s.toFixed(3)}` : `sim ${s.toFixed(3)}`;

export async function getContext(question: string) {
    if (!store) store = await FaissStore.load(FAISS_DIR, embeddings);

    const raw = await store.similaritySearchWithScore(question, CANDIDATE_K);
    if (!raw.length) return { context: "", used: [] as string[] };

    const bestRaw =
        SCORE_MODE === "distance"
            ? Math.min(...raw.map(([, s]) => s))
            : Math.max(...raw.map(([, s]) => s));

    const cands = raw
        .map(([d, s]) => {
            const text = String((d as any).pageContent ?? "");
            return { text, s, kw: keywordBoost(question, text) };
        })
        .sort((a, b) => rankKey(a.s, a.kw) - rankKey(b.s, b.kw));

    const hasPhoenix = question.toLowerCase().includes("phoenix") &&
        cands.some(c => c.text.toLowerCase().includes("proiectul phoenix"));

    if (!rawGate(bestRaw) && !hasPhoenix) return { context: "", used: [] };

    const picked = cands.slice(0, TOP_K);
    const bullets = picked
        .map((c, i) => `[#${i + 1}] (${fmt(c.s)}, kw ${c.kw}) ${c.text}`)
        .join("\n\n");
    return { context: `Context din PDF (top ${TOP_K}):\n${bullets}\n\n`, used: picked.map(p => p.text) };
}
