import "dotenv/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { pipeline } from "@xenova/transformers";

const KNOWLEDGE_DIR = path.resolve(process.cwd(), "../knowledge");
const FAISS_DIR = path.resolve(process.cwd(), "../thunder_db");
const EMB_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

async function listPdf(dir: string) {
    const files = await fs.readdir(dir).catch(() => []);
    return files.filter(f => f.toLowerCase().endsWith(".pdf")).map(f => path.join(dir, f));
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
    const pdfs = await listPdf(KNOWLEDGE_DIR);
    if (!pdfs.length) {
        console.log(`⚠️  Nu am găsit PDF-uri în ${KNOWLEDGE_DIR}`);
        process.exit(1);
    }
    console.log("📚 PDF-uri:", pdfs.map(p => path.basename(p)).join(", "));

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 150 });

    const allDocs = [];
    for (const pdfPath of pdfs) {
        const docs = await new PDFLoader(pdfPath).load();
        const split = await splitter.splitDocuments(docs.map(d => {
            d.metadata = { ...(d.metadata || {}), source: path.basename(pdfPath) };
            return d;
        }));
        allDocs.push(...split);
    }
    console.log(`Total bucăți: ${allDocs.length}`);

    const store = await FaissStore.fromDocuments(allDocs, embeddings);
    await store.save(FAISS_DIR);
    console.log(`✅ Index FAISS rescris în ${FAISS_DIR}`);
}

run().catch(e => { console.error(e); process.exit(1); });
