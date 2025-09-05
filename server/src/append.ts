import "dotenv/config";
import * as path from "node:path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { pipeline } from "@xenova/transformers";

const FAISS_DIR = path.resolve(process.cwd(), "../thunder_db");
const EMB_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// npm run append -- ../knowledge/alt.pdf ../knowledge/alt2.pdf
const inputs = process.argv.slice(2);
if (!inputs.length) {
    console.error("Folosește: ts-node scripts/append.ts <pdf1> <pdf2> ...");
    process.exit(1);
}

const embeddings = (() => {
    let extractor: any;
    return {
        embedDocuments: async (texts: string[]) => {
            if (!extractor) extractor = await pipeline("feature-extraction", EMB_MODEL);
            const out: number[][] = [];
            for (const t of texts) {
                const r = await extractor(t, { pooling: "mean", normalize: true });
                out.push(Array.from(r.data as Float32Array));
            }
            return out;
        },
        embedQuery: async (t: string) => (await (await embeddings.embedDocuments([t])))[0],
    } as any;
})();

async function run() {
    const store = await FaissStore.load(FAISS_DIR, embeddings);
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 150 });

    let added = 0;
    for (const pdfPath of inputs) {
        const docs = await new PDFLoader(pdfPath).load();
        const split = await splitter.splitDocuments(
            docs.map(d => ({ ...d, metadata: { ...(d.metadata || {}), source: path.basename(pdfPath) } }))
        );
        await store.addDocuments(split);
        added += split.length;
        console.log(`➕ ${path.basename(pdfPath)} → ${split.length} bucăți`);
    }

    await store.save(FAISS_DIR);
    console.log(`✅ Append finalizat. Bucăți adăugate: ${added}. Index salvat în ${FAISS_DIR}`);
}

run().catch(e => { console.error(e); process.exit(1); });
