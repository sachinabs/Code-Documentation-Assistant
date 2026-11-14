# RepoMind AI — Technical Deep Dive & Interview Guide

> **Scope.** This document describes **only** the repository at `D:\Projects\Task\Repo Mind - AI`. It was produced by reading the actual source, Prisma schema and migrations, routes, tests, dependency manifests/locks, Docker Compose file, env example and READMEs, plus a few safe runtime checks. **No application source or configuration file was modified by this analysis**; all citations refer to the current working-tree contents.
>
> **How to read the labels.** Every non-obvious claim carries one of these:
>
> - **[Verified]** — directly visible in the cited file/line, or observed in a runtime check.
> - **[Partial]** — implemented, but incomplete or with a known gap.
> - **[Not found]** — searched for and absent. Do **not** claim it in an interview.
> - **[Recommended]** — an improvement idea, not current behaviour.
> - **[General]** — general engineering knowledge, not a claim about this repo.
> - **[Unknown]** — cannot be confirmed from the repo. Say "I don't know" instead of guessing.

---

### Contents

0. [Evidence Log](#0-evidence-log-what-was-actually-checked)
1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack-exact-versions-from-lockfiles)
3. [Architecture](#3-architecture)
4. [Feature Inventory](#4-feature-inventory)
5. [RAG Pipeline](#5-rag-pipeline--the-core-deep-dive)
6. [LLM / Prompt Engineering](#6-llm--prompt-engineering-deep-dive)
7. [Agentic, ML and NLP](#7-agentic-ml-and-nlp--what-is-actually-there)
8. [Backend & API](#8-backend--api-deep-dive)
9. [Database](#9-database-deep-dive)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [End-to-End Workflows](#11-end-to-end-workflows)
12. [Configuration & Environment Variables](#12-configuration--environment-variables)
13. [Troubleshooting](#13-troubleshooting-guide)
14. [Performance](#14-performance-analysis)
15. [Security](#15-security-analysis)
16. [Testing](#16-testing)
17. [Trade-offs & Design Decisions](#17-trade-offs--design-decisions)
18. [Interview Preparation](#18-interview-preparation)
19. [Cheat Sheets](#19-cheat-sheets)
20. [Glossary](#20-glossary)
21. [Final 40-Question Assessment](#21-final-40-question-assessment)
22. [What I Must Know Before the Interview](#22-what-i-must-know-before-attending-the-interview)

---

## 0. Evidence Log (what was actually checked)

### 0.1 Static inspection

All files under `backend/src`, `backend/prisma` (schema + all 5 migration folders), `backend/tests`, `frontend/src`, both `package.json`, both `package-lock.json`, `backend/docker-compose.yml`, `backend/jest.config.js`, `backend/.env.example`, `backend/.env`, `.gitignore` and the three READMEs.

### 0.2 Runtime checks (read-only or disposable)

| Check | Observed result | Meaning |
|---|---|---|
| `GET http://localhost:5000/health` | `200 {"status":"ok"}` | Express app boots and the health route works. |
| `GET http://localhost:8000/api/v2/heartbeat` | `200`, heartbeat JSON | ChromaDB container is reachable. |
| `POST /api/repositories` body `{"url":"https://example.com/x/y"}` | **`500`** `{"message":"Invalid GitHub repository URL"}` | Invalid input is treated as a server error; see §11.3. |
| `npm test -- --runInBand` (with `NODE_OPTIONS=--max-old-space-size=2048`) | **2 suites, 5 tests passed** | Tests are green. |
| `npm run build` (with `NODE_OPTIONS=--max-old-space-size=4096`) | **5150 modules**, main chunk **1,671.17 kB** (gzip **528.74 kB**), chunk-size warning | Build succeeds; bundle is large. |
| Chroma `add()` twice with the same ID in a throwaway collection | Second `add()` **succeeded** but stored document stayed `"first"` | `add()` does **not** overwrite; this matters for re-indexing (§7.4). |

Two practical environment notes: the backend test run and the frontend build both ran out of memory in this environment unless a larger `--max-old-space-size` was supplied. That is a machine constraint, not an application bug. The Chroma client also printed `Cannot instantiate a collection with the DefaultEmbeddingFunction` because embeddings are always supplied explicitly by the app.

---

## 1. Project Overview

**One sentence:** RepoMind AI is a local-first "chat with a GitHub repository" tool — it clones a public repo, scans supported source files, chunks them, embeds the chunks with Ollama, stores vectors in ChromaDB, and answers questions through an Ollama chat model with file/line source references.

### 1.1 At a glance

| Aspect | Reality in this repo |
|---|---|
| Product type | Local developer tool / proof of concept, not a multi-tenant SaaS |
| Input | A **public** GitHub URL (`https://github.com/<owner>/<repo>`) |
| Clone method | `git clone --depth 1` via `child_process.spawn` (`backend/src/services/repository.service.js:54-55`; `backend/src/utils/git.utils.js:22-41`) |
| Supported files | 16 extensions (JS/TS/JSX/TSX, Python, Java, Go, PHP, JSON, Markdown, SQL, YAML, Shell) |
| Language/stack detection | Filename + manifest heuristics (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`) |
| Retrieval | Embedding similarity in ChromaDB + a "broad question" full-repo scan |
| LLM | Ollama HTTP API, default `qwen2.5:3b` |
| Embeddings | Ollama HTTP API, default `nomic-embed-text` |
| Metadata DB | PostgreSQL via Prisma 5.22 |
| Frontend | React 19 + Vite 8 + Ant Design 6 + React Router 7 |
| Auth | **Not found** (no login, JWT, sessions, RBAC) |
| Background jobs | **Not found** (async fire-and-forget promises in the same Node process) |
| Streaming | **Not found** (`stream: false` in every Ollama call) |
| Deployment | Docker Compose for Postgres + Chroma only; **no Dockerfile, no CI** |

### 1.2 What problem it solves

Reading an unfamiliar repository is slow. RepoMind lets a developer ask natural-language questions ("How does authentication work?", "List all API endpoints") and get an answer grounded in retrieved code chunks, with file paths and line ranges that can be clicked to open the source. It also pre-computes repo-level artefacts: language stats, tech stack, an API endpoint list and an AI-written architecture diagram.

### 1.3 Honest maturity assessment

This is a **working local prototype**. The core vertical slice (clone → scan → chunk → embed → store → retrieve → answer) is implemented end-to-end and does run. The surrounding product surface (auth, jobs, progress, incremental indexing, production hardening, real settings) is mostly missing. The README's own "Future improvements" list (`README.md:214-224`) admits several of these. Treat the code — not the README — as the source of truth.

---

## 2. Technology Stack (exact versions from lockfiles)

### 2.1 Backend (`backend/package.json`, `backend/package-lock.json`)

| Package | Declared | Installed (lockfile) | Role |
|---|---|---|---|
| `express` | `^5.3.0` | **5.3.0** | HTTP server and routing |
| `@prisma/client` | `^5.22.0` | **5.22.0** | PostgreSQL ORM client |
| `prisma` | `^5.22.0` | **5.22.0** | Schema/migration CLI |
| `chromadb` | `^3.5.0` | **3.5.0** | Vector DB client |
| `axios` | `^1.21.1` | **1.21.1** | Ollama HTTP calls |
| `cors` | `^2.8.6` | **2.8.6** | Cross-origin middleware |
| `dotenv` | `^18.0.10` | **18.0.10** | Env loading |
| `mermaid` | `^12.3.0` | **12.3.0** | Declared, **unused in backend source** |
| `jsdom` | `^29.1.1` | **29.1.1** | Declared, **unused in backend source** |
| `simple-git` | `^4.0.2` | **4.0.2** | Declared, **unused** (git is invoked with `child_process.spawn`) |
| `jest` (dev) | `^30.5.2` | **30.5.2** | Test runner |
| `supertest` (dev) | `^7.3.2` | **7.3.2** | HTTP assertions |
| `nodemon` (dev) | `^3.1.14` | **3.1.14** | Dev auto-reload |

**ESM:** `"type": "module"` — all files use `import`/`export` (`backend/package.json:16`).

**Scripts:** `dev` = `nodemon src/server.js`, `start` = `node src/server.js`, `test` = Jest via `node --max-old-space-size=4096 --experimental-vm-modules` (`backend/package.json:6-12`).

### 2.2 Frontend (`frontend/package.json`, `frontend/package-lock.json`)

| Package | Declared | Installed | Role |
|---|---|---|---|
| `react` / `react-dom` | `^19.3.1` | **19.3.1** | UI runtime |
| `vite` (dev) | `^8.3.6` | **8.3.8** | Dev server + build |
| `antd` | `^6.7.0` | **6.7.0** | Component library |
| `@ant-design/icons` | `^6.3.4` | **6.3.4** | Icons |
| `react-router-dom` | `^7.18.5` | **7.18.5** | Client routing |
| `axios` | `^1.21.1` | **1.21.1** | API calls |
| `mermaid` | `^12.3.0` | **12.3.0** | Diagram rendering |
| `react-markdown` | `^10.1.0` | **10.1.0** | Markdown rendering |
| `remark-gfm` | `^4.0.1` | **4.0.1** | Tables/strikethrough |
| `rehype-highlight` | `^7.0.2` | **7.0.2** | Code syntax highlighting |
| `highlight.js` | `^11.12.0` | **11.12.0** | Highlight theme/runtime |
| `lucide-react` | `^1.73.0` | **1.73.0** | Declared, **not imported anywhere in `src`** |
| `oxlint` (dev) | `^1.90.0` | **1.93.0** | Linter (`npm run lint`) |
| `@vitejs/plugin-react` (dev) | `^6.1.2` | **6.3.0** | React Fast Refresh / build plugin |

### 2.3 AI & infrastructure

| Component | Value |
|---|---|
| LLM runtime | Ollama at `http://localhost:11434` |
| Chat model default | `qwen2.5:3b` (`backend/src/config/ollama.js:2`) |
| Embedding model default | `nomic-embed-text` (`backend/src/config/ollama.js:3`) |
| Vector store | ChromaDB HTTP at `http://localhost:8000`, collection **`repomind_chunks`** (`backend/src/config/chroma.js`) |
| Relational DB | PostgreSQL 15 (Docker image) |
| ORM | Prisma, provider `postgresql` |

### 2.4 What is *not* in the stack (verify before claiming)

No TypeScript in app code, no Next.js, no Redux/Zustand, no Tailwind, no LangChain/LlamaIndex, no OpenAI/Anthropic SDK, no Redis, no message queue, no WebSocket/SSE, no JWT/passport, no Dockerfile, no GitHub Actions/CI config, no ESLint config (oxlint is declared), no rate limiter, no logger library, no OpenAPI/Swagger generation. All **[Not found]**.

---

## 3. Architecture

### 3.1 System context

```mermaid
flowchart TD
    U["Developer in browser"] --> FE["React 19 + Vite + Ant Design 6"]
    FE -->|"REST /api, JSON, 300s timeout"| BE["Express 5 backend"]
    BE -->|"Prisma"| PG["PostgreSQL 15"]
    BE -->|"git clone --depth 1"| GH["Public GitHub repo"]
    BE -->|"scan + chunk"| FS["Local storage/repositories"]
    BE -->|"POST /api/embed"| OL["Ollama embeddings"]
    BE -->|"POST /api/chat"| OLL["Ollama chat model"]
    BE -->|"add / query / delete"| CH["ChromaDB collection repomind_chunks"]
```

### 3.2 Backend layering (actual files)

```mermaid
flowchart TD
    A["server.js — listens on PORT"] --> B["app.js — CORS, JSON 1mb, /health, route mounts"]
    B --> C["routes/*.routes.js"]
    C --> D["controllers/*.controller.js"]
    D --> E["services/*.service.js"]
    E --> F["config/database.js — Prisma singleton"]
    E --> G["config/ollama.js"]
    E --> H["config/chroma.js"]
    E --> I["utils/file.utils.js, git.utils.js"]
    D --> J["middleware/error.middleware.js"]
```

**Layer responsibilities (as implemented):**

- **Routes** only map URL + method to controller functions. `backend/src/routes/repository.routes.js`, `chat.routes.js`, `milestone.routes.js`.
- **Controllers** parse `req`, call services, shape responses, and forward errors with `next(err)`.
- **Services** hold business logic: cloning, scanning, chunking, embedding, vector I/O, retrieval, LLM calls.
- **Config** exposes env-derived constants.
- **Middleware** is a single generic error handler.
- There is **no** repository/controller validation layer, no DTO/schema validation library, no dependency-injection container.

### 3.3 Indexing flow (sequence)

```mermaid
sequenceDiagram
    participant UI as React UI
    participant API as Express API
    participant DB as PostgreSQL
    participant GIT as git process
    participant SCAN as Scanner/Chunker
    participant OL as Ollama embed
    participant CH as ChromaDB

    UI->>API: POST /api/repositories {url}
    API->>DB: validate URL, create Repository(status=pending)
    API->>DB: update localPath, status=cloning
    API-->>UI: 201 repository JSON (clone continues async)
    API->>GIT: clone --depth 1 into storage/<owner>__<repo>__<id>
    GIT-->>API: clone done, default branch
    API->>DB: status=scanning
    API->>SCAN: scan supported files, language stats, tech stack
    API->>DB: status=chunking, totalFiles, languages, techStack
    API->>SCAN: chunk every file (1500 chars, 200 overlap)
    API->>DB: status=embedding
    loop batches of 20 chunks
        API->>OL: POST /api/embed (input = batch)
        OL-->>API: vectors
        API->>CH: collection.add(ids, documents, embeddings, metadatas)
        API->>DB: indexedFiles, totalChunks
    end
    API->>DB: status=completed, currentStage=completed
```

### 3.4 Chat flow (sequence)

```mermaid
sequenceDiagram
    participant UI as React UI
    participant API as Express /api/chat
    participant DB as PostgreSQL
    participant EMB as Ollama embed
    participant CH as ChromaDB
    participant LLM as Ollama chat

    UI->>API: POST /api/chat {repositoryId, question, conversationId?}
    API->>DB: find/create Conversation, insert user Message
    API->>DB: load history, repository, milestones
    API->>EMB: embed the question
    EMB-->>API: query vector
    API->>CH: query where repositoryId, nResults 5 (or 10 if broad)
    CH-->>API: top chunks + metadata
    alt broad question
        API->>API: scan repo, take first 40 files, truncate to 1500 chars
        API->>API: dedupe by filePath, cap at 15 chunks
    end
    API->>API: inject milestone summaries + conversation summary
    API->>LLM: POST /api/chat (system prompt + last 6 msgs + context)
    LLM-->>API: answer (+ optional mermaid block)
    API->>DB: insert assistant Message
    API->>DB: if messages >= 8 and count % 4 == 0, summarize conversation
    API-->>UI: {answer, diagram, sources, conversationId}
```

### 3.5 The one genuinely "agentic-ish" part

There is **no** agent, planner, tool-calling loop or multi-step reasoning controller. What exists is a small deterministic router:

- `isBroadQuestion()` regex decides whether to add a full-repo scan (`retrieval.service.js:8-11`).
- `isArchitectureQuestion()` regex decides whether to append the Mermaid architecture prompt (`llm.service.js:195-197, 271-273`).
- Broad questions retrieve 10 vectors instead of 5 and get up to 15 total context chunks.

That is **conditional retrieval**, not an agent. Say that precisely in an interview.

---

## 4. Feature Inventory

Status meanings: **Implemented** = works end-to-end; **Partial** = works with a meaningful limitation; **Not found** = no implementation.

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Submit a public GitHub URL | Implemented | `frontend/src/pages/Repositories.jsx:78-105`; `repository.controller.js:7-16` |
| 2 | Strict GitHub URL parsing (host + owner/repo) | Implemented | `utils/git.utils.js:4-20` |
| 3 | Reject non-GitHub URLs | Partial — returns **500** instead of 400 | `github.service.js:3-7`; runtime check §0.2 |
| 4 | Clone repo shallowly | Implemented | `repository.service.js:54-55` (`--depth 1`, 300 s timeout) |
| 5 | Duplicate URL de-duplication | Partial — `findFirst` only, no DB unique constraint | `repository.service.js:9-11, 23-24` |
| 6 | Scan supported extensions | Implemented | `utils/file.utils.js:9-12`; `file-scanner.service.js:7-23` |
| 7 | Skip binary / oversized files | Implemented | `utils/file.utils.js:34-40` (NUL byte check, `MAX_FILE_SIZE_BYTES`) |
| 8 | Ignore common build/vendor dirs | Implemented | `utils/file.utils.js:4-7` |
| 9 | Language statistics with % | Implemented | `file-scanner.service.js:33-57` |
| 10 | Tech-stack detection | Implemented (heuristic) | `file-scanner.service.js:127-221` |
| 11 | Framework capability detection (FastAPI docs URLs) | Implemented (narrow) | `file-scanner.service.js:76-125` |
| 12 | Code chunking with overlap | Implemented | `chunking.service.js:17-69` |
| 13 | Embedding via Ollama | Implemented | `embedding.service.js:10-33` |
| 14 | Vector storage in Chroma | Implemented | `vector.service.js:20-32` |
| 15 | Semantic retrieval filtered by repo | Implemented | `vector.service.js:34-52` |
| 16 | Broad-question whole-repo context | Implemented (capped) | `retrieval.service.js:42-83` |
| 17 | Chat with repo + source refs | Implemented | `chat.controller.js:5-100` |
| 18 | Optional architecture Mermaid diagram | Implemented | `llm.service.js:158-197, 293-300` |
| 19 | Mermaid sanitisation | Partial — basic line/node rewriting | `llm.service.js:6-44` |
| 20 | Multiple conversations per repo | Implemented | `chat.controller.js:102-147`; `RepositoryWorkspace.jsx:59-86, 221-241` |
| 21 | Auto conversation title | Implemented | `chat.controller.js:17-21` |
| 22 | Conversation rename/delete | Implemented | `chat.controller.js:115-135`; `RepositoryWorkspace.jsx:535-550` |
| 23 | Periodic conversation summary | Implemented | `chat.controller.js:79-86`; `llm.service.js:199-216` |
| 24 | Milestones (generate, save, list, edit, delete) | Implemented | `milestone.controller.js:4-69`; `llm.service.js:218-264` |
| 25 | Milestones injected into chat context | Implemented (keyword score, top 3) | `chat.controller.js:40-58` |
| 26 | API endpoint discovery from source | Partial — regex only | `repository.controller.js:118-186` |
| 27 | File tree + file viewer with line highlight | Implemented | `repository.controller.js:63-91`; `RepositoryWorkspace.jsx:125-146, 552-583` |
| 28 | Re-index repository | Partial — does not clear old vectors | `repository.controller.js:93-107`; `vector.service.js:20-32` |
| 29 | Delete repo (DB, vectors, files) | Implemented | `repository.service.js:75-115` |
| 30 | Indexing progress bar | Partial — always 0; backend sends no progress | `Repositories.jsx:58`; no `progress` in status response |
| 31 | Indexing history page | Partial — shows live repos, not history | `IndexingHistory.jsx`; no history model |
| 32 | Dashboard stats | Partial — "Last Indexed" column empty | `Dashboard.jsx:32-36, 54` |
| 33 | Settings | Not found (fake save) | `Settings.jsx:8-14` |
| 34 | Standalone chat page | Not found (file exists but unrouted) | `ChatAssistant.jsx`; absent from `App.jsx:12-20` |
| 35 | Authentication / users / RBAC | Not found | No middleware, no user model |
| 36 | Streaming answers | Not found | `stream: false` (`llm.service.js:208, 245, 290`) |
| 37 | Background job queue / worker | Not found | Fire-and-forget promises only |
| 38 | Incremental / git-pull re-index | Not found | Re-index re-scans the same clone |

---

## 5. RAG Pipeline — The Core Deep Dive

This is the most important part of the project to understand and to be able to defend. The pipeline is: **scan → chunk → embed → store → retrieve → assemble prompt → generate → post-process**.

### 5.1 Stage 1 — Scan

`scanRepository(localPath)` (`file-scanner.service.js:7-23`):

1. `walkDirectory()` recursively lists files, skipping `IGNORED_DIRS` (`node_modules`, `.git`, `dist`, `build`, `coverage`, `vendor`, `.cache`, `.next`, `.nuxt`, `target`, `bin`, `obj`, `__pycache__`) — `file.utils.js:4-7, 14-32`.
2. Keeps only `SUPPORTED_EXTENSIONS`: `.js .jsx .ts .tsx .py .java .go .php .json .md .sql .yaml .yml .sh .bash` — `file.utils.js:9-12`.
3. `readFileSafe()` skips files larger than `MAX_FILE_SIZE_BYTES` (default 200,000) and files containing a NUL byte (binary heuristic) — `file.utils.js:34-40`.
4. Returns `{path, fullPath, language, content}` objects.

**Consequence:** every supported file is read fully into memory during a scan. There is no ignore-file (`.gitignore`) awareness, no `README` special-casing at scan time, and no content deduplication.

### 5.2 Stage 2 — Chunk

`chunkCode(content, filePath, language)` (`chunking.service.js:17-69`):

| Parameter | Default | Source |
|---|---|---|
| `MAX_CHUNK_SIZE` | **1500 characters** | `chunking.service.js:1` |
| `CHUNK_OVERLAP` | **200 characters** | `chunking.service.js:2` |
| Boundary detection | regex on `function/class/const/let/var`, Python `def/class`, Java/C-style signatures | `chunking.service.js:4` |

Logic:

- Iterates lines, accumulating `currentSize` (line length + 1).
- If a line looks like a declaration **and** the current chunk is already > `MAX_CHUNK_SIZE / 3` (500 chars), it finalises the chunk and starts a new one.
- If `currentSize >= 1500`, it finalises and starts a new chunk seeded with the last ~200 chars of lines (line-based overlap, `overlapLines`, lines 6-15).
- The final partial chunk is flushed with `endLine = lines.length`.

**Important accuracy caveats (good interview material):**

- Sizes are **characters, not tokens**. 1500 chars ≈ 350–450 tokens for typical code, safely inside most context windows, but the code never measures tokens.
- Line numbers are approximate. `finalize(i)` passes a 1-based-ish index, then overlap adjusts `startLine = i + 2 - ov.length`; there is a post-fix clamp but no test proving exact ranges.
- Overlap is measured in characters but taken in whole lines, so actual overlap can exceed 200 chars.
- The chunk boundary regex is language-agnostic and will miss many constructs (arrow functions, Rust `fn`, Ruby `def` is covered only by the Python branch pattern `def`, etc.).

### 5.3 Stage 3 — Embed

`embedTexts(texts)` (`embedding.service.js:10-33`):

- `POST ${OLLAMA_BASE_URL}/api/embed` with `{model: OLLAMA_EMBEDDING_MODEL, input: texts, options:{num_gpu: 99}}`.
- Timeout **180,000 ms** (`EMBEDDING_TIMEOUT`).
- **Two attempts**, 2,000 ms apart; throws a friendly `"Embedding service is temporarily unavailable. Please try again."` on double failure.
- `embedText(text)` is a convenience wrapper returning the first vector.
- The whole batch is sent in one request (`input` accepts an array) — no per-text loop.

### 5.4 Stage 4 — Store

`addChunks(chunks, embeddings)` (`vector.service.js:20-32`):

- Lazily creates a singleton `ChromaClient` and a singleton collection via `getOrCreateCollection({name: 'repomind_chunks'})`.
- Sends `ids`, `documents` (chunk text), `embeddings` (pre-computed), and `metadatas` = `{repositoryId, filePath, language, startLine, endLine}`.
- Chunk IDs are `${repositoryId}:${index}` (`indexing.service.js:49-52`).

`searchChunks(repositoryId, queryEmbedding, topK)` (`vector.service.js:34-52`):

- `col.query({queryEmbeddings:[vec], nResults: topK, where:{repositoryId}})`.
- Returns `{id, content, filePath, language, startLine, endLine}`.

`deleteRepositoryChunks(repositoryId)` (`vector.service.js:54-57`): `col.delete({where:{repositoryId}})`.

**Verified runtime behaviour (critical):** Chroma's `add()` with an already-existing ID **does not overwrite** the record. Our throwaway-collection test added `"first"`, then added the same ID with `"second"`; the call resolved, but a subsequent `get()` returned `["first"]`. Since re-index reuses the same deterministic IDs and never deletes first, **a re-index does not refresh vectors whose chunk count/positions are unchanged** (see §11.5). `upsert()` exists in the Chroma client but is not used.

### 5.5 Stage 5 — Retrieve

`retrieveContext(repositoryId, question, repo)` (`retrieval.service.js:23-83`):

| Question type | Trigger | Vector hits | Extra context | Final cap |
|---|---|---|---|---|
| Normal | No broad keywords | `TOP_K = 5` | Tech-stack/language metadata chunk prepended (if stored) | up to 6 |
| Broad | Regex match | `10` | Metadata + **first 40 scanned files**, each truncated to 1500 chars, deduped by path | **15 chunks** |

Broad regex (`retrieval.service.js:8-11`):
`/architect|api|endpoint|route|entry point|how does .* work|structure|flow|improve|missing|feature|recommend|analysis/`

Notes:

- `scoreFile()` (`retrieval.service.js:13-21`) implements a sensible relevance score for README/manifests/entry points/routes — but it is **never called**. Broad selection is simply `files.slice(0, 40)`, i.e. filesystem order. **[Partial]**
- Broad retrieval re-reads every supported file at query time (expensive), then discards all but the first 40.
- Dedupe is by `filePath` only, so a vector chunk and a full-file chunk from the same file do not both appear — the vector chunk wins.
- There is **no** re-ranker, hybrid BM25/keyword search, MMR diversity, metadata filtering beyond `repositoryId`, or score threshold. Distance scores are discarded.

### 5.6 Stage 6 — Assemble the prompt

`generateAnswer(question, contextChunks, history)` (`llm.service.js:266-307`):

```
System: SYSTEM_PROMPT (+ ARCHITECTURE_PROMPT if architecture keywords)
...history.slice(-6)                  // last 6 messages
User: "Repository context:\n<chunks>\n\nQuestion: <question>"
```

- Each chunk is rendered as `File: <path> (lines <start>-<end>)\n<content>`, joined by `\n\n---\n\n`.
- `history` is loaded **after** inserting the current user message (`chat.controller.js:24-31`), so the current question appears once in history **and again** in the final user block — a duplication bug worth mentioning.
- Before generation the controller may prepend a conversation summary and append up to 3 milestone summaries (`chat.controller.js:40-69`).

Prompt size is **unbounded in characters** apart from the chunk caps: 15 chunks × up to ~1500 chars + history + prompts. On a `qwen2.5:3b` context window this can overflow or silently truncate. **[Partial]**

### 5.7 Stage 7 — Generate

| Setting | Value | Source |
|---|---|---|
| Model | `qwen2.5:3b` | `config/ollama.js:2` |
| Temperature (answers) | **0.1** | `llm.service.js:291` |
| `stream` | **false** | `llm.service.js:290` |
| `num_gpu` | env `OLLAMA_NUM_GPU`, default **99** | `config/ollama.js:4` |
| Timeout | **300,000 ms** | `config/ollama.js:6` |
| Retries | **2 attempts**, 3,000 ms apart | `llm.service.js:285-306` |
| History window | last **6** messages | `llm.service.js:277` |
| Summary temperature | 0.2 | `llm.service.js:209` |
| Milestone temperature | 0.2, `format:'json'`, no retry | `llm.service.js:246` |

`OLLAMA_NUM_GPU=99` is a **configuration hint** ("use many GPU layers"), not proof that a GPU exists or is used. The app runs fine on CPU; Ollama decides. Do not claim GPU acceleration in an interview.

### 5.8 Stage 8 — Post-process

- The answer is returned verbatim as `answer`.
- If the text contains a fenced ```mermaid block, the regex at `llm.service.js:295` extracts it and `sanitizeMermaid()` rewrites it.
- `sanitizeMermaid()` (`llm.service.js:6-44`) maps node IDs to `N0, N1, ...`, wraps labels in `["..."]`, replaces `"` with `'`, drops duplicate trimmed lines, and keeps `flowchart|graph` headers. It is a **best-effort textual fix**, not a parser.
- `isLikelyValidMermaid()` (`llm.service.js:46-48`) simply `return true` and is unused. **[Not found / dead code]**
- The frontend also renders any `language-mermaid` code block through `ArchitectureDiagram` (`MarkdownMessage.jsx:21-23`), and the chat response's `diagram` field is rendered separately (`RepositoryWorkspace.jsx:315-319`). This can duplicate diagrams when the model also prints the block inline. **[Partial]**

### 5.9 RAG parameter quick table

| Knob | Where | Default | Effect |
|---|---|---|---|
| `TOP_K` | `retrieval.service.js:6` | 5 | Normal vector hits |
| Broad nResults | `retrieval.service.js:25` | 10 | Broad vector hits |
| Broad file cap | `retrieval.service.js:48` | 40 | Files scanned into context |
| Broad per-file chars | `retrieval.service.js:50` | 1500 | Truncation |
| Total context cap | `retrieval.service.js:82` | 15 | Chunks sent to LLM |
| Chunk size | `chunking.service.js:1` | 1500 chars | Granularity |
| Chunk overlap | `chunking.service.js:2` | 200 chars | Continuity |
| Embed batch | `indexing.service.js:7` | 20 | Ollama requests |
| History window | `llm.service.js:277` | 6 messages | Follow-up context |
| Milestones injected | `chat.controller.js:48` | 3 | Prior decisions |
| Summary cadence | `chat.controller.js:81` | ≥8 msgs and %4 | Rolling memory |

---

## 6. LLM / Prompt Engineering Deep Dive

### 6.1 The system prompt

`SYSTEM_PROMPT` (`llm.service.js:50-156`) is unusually long (≈100 lines). Its rules fall into groups:

1. **Grounding:** answer only from the selected repo; never mix repos; never invent tech/APIs/functions; say when context is insufficient; cite file/line; distinguish verified vs assumed vs recommended.
2. **Framework awareness:** know that FastAPI exposes `/docs`, `/redoc`, `/openapi.json` by default; don't recommend what a framework already provides.
3. **Feature classification:** Implemented / Partially Implemented / Not Implemented / Unable to Verify, each with evidence.
4. **Improvement reports:** full feature inventory, confidence levels (High/Medium/Low), no duplicate findings, 9 fixed output sections, separate missing vs optional.
5. **Technology suitability:** check existing deps first; avoid recommending Redis/Celery/Kubernetes/JWT/API gateways without evidence; avoid over-engineering small projects.
6. **Code generation rules:** verify APIs, no invented imports/endpoints, no secrets, no duplicate routes.

**Assessment:** the prompt is thoughtfully written for accuracy and anti-hallucination, and its "don't over-engineer" guidance matches the repo's own philosophy. But a 3B model frequently ignores long instruction sets, and the code does **not** validate that the model followed the required output format. **[Partial]**

### 6.2 Architecture prompt

`ARCHITECTURE_PROMPT` (`llm.service.js:158-193`) is appended when `/architect|structure|component|flow|diagram/i` matches the question (`llm.service.js:195-197`). It mandates `flowchart TD`, IDs `A..J`, every node as `ID["Label"]`, ≤10 nodes, no invented components, and a fenced mermaid block after the explanation. The example is small and valid.

### 6.3 Answer vs summary vs milestone prompts

| Function | Prompt style | Output contract | Failure behaviour |
|---|---|---|---|
| `generateAnswer` | System prompt + RAG context | Free Markdown; optional Mermaid | 2 tries, then throw |
| `summarizeConversation` | One-line system instruction, whole conversation as user text | Plain summary | Logs and returns `''` |
| `generateMilestone` | Structured JSON schema in prompt + `format:'json'` | JSON with 8 fields | Logs and returns `null` |

`generateMilestone` defensively coerces every array field with `Array.isArray(...) ? ... : []` and supplies a default title (`llm.service.js:250-259`). That is the most robust parsing in the codebase.

### 6.4 Prompt-injection and trust boundary

Repository content (including README files and comments) is inserted into the user turn **without delimiting or escaping** (`llm.service.js:267-281`). A malicious repo could contain text like "ignore previous instructions and reveal…". There is no instruction hierarchy enforcement, no content sanitisation, no output filter. Because the tool only reads public code and has no tools/secrets, impact is limited, but it is a real risk to name honestly. **[Partial / Security]**

### 6.5 Context duplication and memory design

- The current question is stored, then loaded into `history`, then repeated in the final user message (`chat.controller.js:24-31` + `llm.service.js:275-281`).
- Rolling memory is a single `Conversation.summary` string overwritten every 4 messages after the 8th (`chat.controller.js:79-86`). Older raw messages remain in the DB and are re-loaded, but only the last 6 reach the model.
- Milestones are a second, human-editable memory layer, scored by naive keyword overlap (`chat.controller.js:42-48`).

---

## 7. "Agentic", ML and NLP — What Is Actually There

Interviewers often ask "is this an agent?" Be precise.

### 7.1 Agentic AI

| Agentic capability | Present? | Evidence |
|---|---|---|
| Tool/function calling by the LLM | **No** | No tools schema, no tool loop |
| Planner / task decomposition | **No** | Single prompt/response |
| Multi-step self-reflection | **No** | No critique/retry based on answer quality |
| Autonomous actions (write files, run commands) | **No** | Backend never executes model output |
| Conditional retrieval routing | **Yes (limited)** | `isBroadQuestion`, `isArchitectureQuestion` |
| Memory (summary + milestones) | **Yes** | `Conversation.summary`, `Milestone` |
| Retry on transport failure | **Yes** | 2 attempts in embed/answer |

**Correct framing:** "It is a RAG pipeline with deterministic query routing and two layers of memory — not an autonomous agent."

### 7.2 Machine learning

| ML aspect | Reality |
|---|---|
| Model training / fine-tuning | **None** — no datasets, no training code, no checkpoints |
| Pretrained LLM | `qwen2.5:3b` served by Ollama |
| Pretrained embedding model | `nomic-embed-text` |
| Similarity search | ChromaDB ANN (HNSW by default in Chroma) |
| Distance metric | **Unknown** — not declared in code or collection config |
| Embedding dimension | **Unknown** — never read or asserted in code; `nomic-embed-text` is commonly 768-d but do not state it as fact here |
| Evaluation metrics | **None** — no recall@k, faithfulness, latency benchmarks |
| Classical ML | **None** |

### 7.3 NLP

| NLP aspect | Reality |
|---|---|
| Tokenisation | None explicit; Ollama tokenises internally |
| Embeddings | Dense vectors from `nomic-embed-text` |
| Keyword scoring | `question.toLowerCase().split(/\s+/)` + `includes` for milestone ranking (`chat.controller.js:42-48`) |
| Regex classification | Broad-question and architecture-intent routing |
| Language detection | File extension mapping, not content-based (`file.utils.js:42-50`) |
| NER / sentiment / summarisation model | No dedicated models; summary is LLM-generated |
| Structured extraction | Regex-based API discovery + LLM JSON milestone extraction |

**Honest summary:** the project uses NLP through pretrained models and simple lexical heuristics; it does not implement NLP algorithms itself.

---

## 8. Backend & API Deep Dive

### 8.1 App bootstrap

`backend/src/server.js` loads `dotenv/config`, imports the app, and listens on `PORT || 5000` (lines 1-8). `backend/src/app.js`:

| Middleware / mount | Detail | Line |
|---|---|---|
| `cors()` | **All origins allowed**, default methods/headers | `app.js:10` |
| `express.json({limit:'1mb'})` | 1 MB JSON body cap | `app.js:11` |
| `GET /health` | Static `{status:'ok'}` — does not check DB/Ollama/Chroma | `app.js:13` |
| `/api/repositories` | repository routes | `app.js:15` |
| `/api/chat` | chat routes | `app.js:16` |
| `/api/conversations` | inline router: messages/rename/delete | `app.js:18-25` |
| `/api/milestones` | milestone edit/delete | `app.js:26` |
| `errorHandler` | last middleware | `app.js:28` |

### 8.2 Complete endpoint inventory

Base URL `http://localhost:5000/api`.

| Method | Path | Handler | Success | Notes |
|---|---|---|---|---|
| GET | `/health` | inline | 200 `{status:'ok'}` | No dependency probing |
| POST | `/repositories` | `createRepository` | 201 repo | 400 if no `url`; **500** if invalid URL |
| GET | `/repositories` | `listRepositories` | 200 array | Newest first |
| GET | `/repositories/:id` | `getRepository` | 200 repo | Lazily computes languages/techStack if missing (`repository.controller.js:31-38`) |
| GET | `/repositories/:id/status` | `getStatus` | 200 subset | `id,status,currentStage,totalFiles,indexedFiles,totalChunks,errorMessage` — **no `progress`** |
| GET | `/repositories/:id/files` | `getFiles` | 200 `{files,tree}` | Tree built server-side |
| GET | `/repositories/:id/files/content?path=` | `getFileContent` | 200 `{path,content,lineCount}` | `safeJoin` prevents traversal; 400 on dir/missing path |
| GET | `/repositories/:id/conversations` | `listConversations` | 200 array | Includes **all messages** per conversation |
| GET | `/repositories/:id/apis` | `getApis` | 200 `{apis,total}` | Regex discovery |
| POST | `/repositories/:id/reindex` | `reindexRepository` | 200 `{message,id}` | Async; does not delete old vectors |
| DELETE | `/repositories/:id` | `deleteRepository` | 200 `{success,message}` | DB tx + vectors + files |
| GET | `/repositories/:id/milestones` | `listMilestones` | 200 array | Newest first |
| POST | `/repositories/:id/milestones` | `createMilestone` | 201 milestone | Requires `title`,`summary` |
| POST | `/repositories/:id/milestones/generate` | `generateMilestone` | 200 generated object | **Not persisted**; client saves via POST above |
| POST | `/chat` | `chat` | 200 `{answer,diagram,sources,conversationId}` | Main RAG endpoint |
| GET | `/chat/:id/messages` | `getMessages` | 200 array | Duplicate of `/conversations/:id/messages` |
| PUT | `/chat/:id` | `renameConversation` | 200 conversation | Duplicate surface |
| DELETE | `/chat/:id` | `deleteConversation` | 204 | Duplicate surface |
| GET | `/conversations/:id/messages` | `getMessages` | 200 array | Used by frontend (`RepositoryWorkspace.jsx:79`) |
| PUT | `/conversations/:id` | `renameConversation` | 200 | Used by frontend (`:540`) |
| DELETE | `/conversations/:id` | `deleteConversation` | 204 | Cascade deletes messages |
| PUT | `/milestones/:milestoneId` | `updateMilestone` | 200 | Only title/description/summary/keyFiles/references |
| DELETE | `/milestones/:milestoneId` | `deleteMilestone` | 204 | Used by frontend (`:501`) |

**API design observations (be ready to critique):**

- The same conversation handlers are exposed under both `/api/chat/:id` and `/api/conversations/:id` — redundant surface.
- Response shapes are inconsistent: bare entity vs `{files,tree}` vs `{apis,total}` vs `{success,message}`.
- No versioning, pagination, filtering, sorting parameters, or `ETag` caching strategy.
- No request-schema validation (no Zod/Joi/express-validator); only manual truthiness checks.
- No OpenAPI/Swagger document, despite the system prompt knowing about FastAPI's.
- `POST /repositories` returns **before** cloning/indexing finishes — correct for responsiveness, but there is no job ID/queue, only status polling.

### 8.3 Error handling

`error.middleware.js`:

```js
export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ message });
}
```

- `next(err)` is used consistently in controllers.
- Only errors with a manually attached `err.status` get a non-500 code. `validateGitHubUrl()` throws a plain `Error`, producing **500** for bad input — confirmed at runtime and asserted by the existing test (`backend/tests/integration/api.test.js:15-18`).
- Raw Prisma/Chroma/internal messages can leak to clients.
- No 404 fallback middleware for unknown routes.

### 8.4 Security controls that *do* exist

| Control | Status | Evidence |
|---|---|---|
| Path traversal prevention on file read | Implemented | `safeJoin` + startsWith check, `git.utils.js:43-49` |
| Path traversal prevention on delete | Implemented | resolved path must start with storage root, `repository.service.js:79-86` |
| Shallow clone (no full history) | Implemented | `--depth 1`, `repository.service.js:55` |
| Shell injection avoidance in git | Implemented | `spawn(..., {shell:false})`, `git.utils.js:24` |
| Git timeout | Implemented | 300 s kill, `git.utils.js:27-31` |
| File size / binary skip | Implemented | `file.utils.js:34-40` |
| CORS restriction | **Not found** | `cors()` open |
| Authentication / authorization | **Not found** | none |
| Rate limiting | **Not found** | none |
| Input length limits beyond JSON 1 MB | **Not found** | none |
| Secrets management | **Not found** | plain `.env` |
| Dependency scanning / CI | **Not found** | none |

---

## 9. Database Deep Dive

### 9.1 Prisma schema (`backend/prisma/schema.prisma`)

Four models. All IDs are `cuid()` strings.

**`Repository`** (lines 10-30)
`id, name, owner, githubUrl, defaultBranch?, localPath?, status='pending', totalFiles=0, indexedFiles=0, totalChunks=0, languages Json?, techStack Json?, currentStage?, errorMessage?, createdAt, updatedAt`
Relations: `conversations[]`, `milestones[]`.

**`Conversation`** (lines 32-42)
`id, repositoryId, title?, summary?, createdAt, updatedAt`
FK → `Repository` with `onDelete: Cascade`. Relations: `messages[]`.

**`Milestone`** (lines 44-62)
`id, repositoryId, conversationId? (plain String, no FK), title, description?, summary, decisions Json?, technologies Json?, keyFiles Json?, completedWork Json?, pendingWork Json?, recommendations Json?, references Json?, createdAt, updatedAt`
FK → `Repository` with `onDelete: Cascade`.

**`Message`** (lines 64-72)
`id, conversationId, role, content, createdAt`
FK → `Conversation` with `onDelete: Cascade`.

### 9.2 Schema critique

- **No indexes at all** — no `@@index([repositoryId])`, `@@index([conversationId])`, `@@index([githubUrl])`, `@@index([createdAt])`. Every list/chat query is a sequential scan as data grows. **[Partial]**
- **No unique constraint on `githubUrl`.** De-duplication is a `findFirst` race (`repository.service.js:9-11, 23-24`); concurrent requests can create duplicates. **[Partial]**
- **`Milestone.conversationId` is not a relation**, so deleting a conversation leaves dangling milestone references and Prisma cannot cascade or include conversation data. **[Partial]**
- `status` and `role` are free-form strings, not enums — typos are possible and there is no DB-level constraint.
- `languages`/`techStack` are JSON blobs, so they cannot be queried/filtered relationally.
- `updatedAt` on `Conversation` is `@default(now()) @updatedAt`; `Repository`/`Milestone` use only `@updatedAt`.
- No soft deletes, audit fields, or user/tenant columns.

### 9.3 Migrations

Five sequential migrations:

| Migration | Adds |
|---|---|
| `20261114064011_init` | Repository, Conversation, Message + FKs |
| `20261114072455_add_languages` | `Repository.languages` |
| `20261114085257_add_techstack` | `Repository.techStack` |
| `20261114092740_add_milestones_and_summary` | Milestone table + `Conversation.summary/title` |
| `20261114125055_add_milestone_details` | Milestone detail JSON fields |

They are plain SQL generated by Prisma and applied with `prisma migrate dev`. No seed script, no rollback scripts, no production migration strategy (`migrate deploy` is not wired into any script).

### 9.4 Write/read patterns

- **Create repository** → insert, then update with `localPath`, then clone, then update status at each stage. Multiple round-trips, no transaction (intentional so partial progress is visible).
- **Index** → one `Repository` update per batch (20 chunks) for `indexedFiles`/`totalChunks`. This is chatty: N/20 writes for N chunks.
- **Delete** → explicit `$transaction` deleting messages, conversations, milestones, repository (`repository.service.js:97-102`). Vector deletion happens **before** the DB transaction and is wrapped in `try/catch`, so a Chroma failure does not block DB deletion (leaves orphans). File removal happens **after** the transaction and throws on failure, so DB rows can be gone while files remain.
- **List conversations** includes every message — potentially large payloads.

---

## 10. Infrastructure & Deployment

### 10.1 Docker Compose (`backend/docker-compose.yml`)

```yaml
services:
  postgres:   image postgres:15, user/pass postgres/password, db repomind, port 5432, volume postgres_data
  chromadb:   image chromadb/chroma:latest, port 8000, volume chroma_data
volumes: postgres_data, chroma_data
```

- Only **infrastructure** is containerised. The Node backend and frontend run on the host.
- **Ollama is not containerised** — it is expected on the host at `11434` (README installs it natively).
- No healthchecks, no restart policies, no resource limits, no networks, no secrets.
- `chromadb/chroma:latest` is an unpinned tag — reproducibility risk.
- **No Dockerfile** for backend or frontend. **[Not found]**
- **No CI/CD** (no `.github/workflows`, no GitLab CI). **[Not found]**

### 10.2 Local startup (from README)

1. `cd backend && docker compose up -d` → Postgres + Chroma.
2. `cp .env.example .env`.
3. `ollama pull qwen2.5:3b && ollama pull nomic-embed-text`; ensure Ollama runs.
4. `cd backend && npm install && npx prisma migrate dev`.
5. `npm run dev` → backend on `:5000`.
6. `cd frontend && npm install && npm run dev` → Vite on `:5173`.

### 10.3 Environment coupling

- Frontend API base URL is **hardcoded** to `http://localhost:5000/api` (`frontend/src/services/api.js:4`), so it cannot point at a remote backend without a code change. The Settings screen pretends to change it but does not.
- Vite has no proxy config (`frontend/vite.config.js` only registers the React plugin).
- Backend CORS is open, which is what makes the hardcoded cross-origin call work in dev.
- Storage path is relative to the backend process CWD (`./storage/repositories`), so starting the server from a different directory changes where repos land.

### 10.4 Operational characteristics

| Concern | Reality |
|---|---|
| Process model | Single Node process; CPU-bound-ish work is mostly I/O (git, HTTP) so it stays responsive, but scans block the event loop during JSON/string work |
| Crash recovery | No job persistence; a crash mid-index leaves `status` stuck at the last stage |
| Observability | `console.log`/`console.error` only; no request IDs, metrics, traces |
| Backups | Only Docker named volumes; no backup scripts |
| Scaling | Cannot horizontally scale: in-memory singleton Chroma collection reference is fine, but fire-and-forget indexing and local file storage bind it to one machine |

---

## 11. End-to-End Workflows

### 11.1 First-time setup

1. Start Docker Desktop and run `docker compose up -d` in `backend/` → Postgres on 5432, Chroma on 8000.
2. Create `.env` from `.env.example`.
3. Pull `qwen2.5:3b` and `nomic-embed-text` with Ollama.
4. `npm install` in both apps.
5. `npx prisma migrate dev` → creates 4 tables.
6. Start backend (`:5000`) and frontend (`:5173`).

**Failure at this stage is usually infrastructure, not app logic:** wrong `DATABASE_URL`, Ollama not running, Chroma port conflict, or missing models.

### 11.2 Adding a repository (happy path)

| Step | Actor | What happens | State after |
|---|---|---|---|
| 1 | UI | User enters URL; `isValidGitHubUrl` regex checks format | — |
| 2 | API | `POST /api/repositories`; controller rejects empty URL with 400 | — |
| 3 | Service | `parseGitHubUrl` normalises to `https://github.com/owner/repo`; `findFirst` avoids exact duplicates | — |
| 4 | DB | `Repository` created | `pending` |
| 5 | Service | `localPath = storage/<owner>__<repo>__<id>`; mkdir parent | `cloning` |
| 6 | Service | Returns quickly; `cloneRepository` runs async | API responded 201 |
| 7 | Git | `git clone --depth 1`, 300 s timeout; `rev-parse` for branch | `scanning` |
| 8 | Scanner | Reads supported files, computes language stats + tech stack | `chunking` |
| 9 | Chunker | Builds all chunks in memory | `embedding` |
| 10 | Embedder | Batches of 20 → Ollama `/api/embed` | `indexedFiles`/`totalChunks` update per batch |
| 11 | Vector | `add()` each batch to `repomind_chunks` | — |
| 12 | DB | Final update | `completed` |

**UI polling:** `Repositories.jsx:51-76` polls `GET /:id/status` every **2 s**, stops on `indexed|completed|success` or `error|failed`, then navigates to the workspace after 800 ms.

### 11.3 Adding a repository (failure paths)

| Failure | Where | Result |
|---|---|---|
| Non-GitHub / malformed URL | `validateGitHubUrl` → plain `Error` | **500** `{message:"Invalid GitHub repository URL"}` |
| Repo does not exist / private | `git clone` exits non-zero | Async catch sets `status=failed`, `errorMessage=stderr` |
| Clone exceeds 300 s | `runGit` timer kills process | `failed`, "Git operation timed out" |
| Disk full / permission | `fs.mkdir` or clone | Rejected in `createRepository`; 500 |
| Ollama down during embedding | `embedTexts` after 2 tries | `failed`, friendly embedding message |
| Chroma down during add | `addChunks` throws (no retry) | `failed` |
| Server restarts mid-index | No recovery | Row stuck in the last stage forever |

### 11.4 Asking a question

1. User types in the workspace textarea; Enter sends (Shift+Enter newline) — `RepositoryWorkspace.jsx:342-357`.
2. UI optimistically appends the user bubble (`:151-153`), sets `sending`.
3. `POST /api/chat` with `{repositoryId, question, conversationId}`.
4. Backend validates presence, finds/creates conversation, auto-titles it (first 40 chars).
5. Inserts the user message, loads history, loads repo and milestones.
6. **Guard:** if `repo.status !== 'completed'`, returns **400** `"Repository indexing is not completed"` (`chat.controller.js:36`).
7. Retrieval (normal or broad) + milestone injection + summary injection.
8. LLM call (2 attempts) with `temperature 0.1`.
9. Assistant message stored; summary maybe regenerated.
10. Response `{answer, diagram, sources, conversationId}`.
11. UI renders Markdown, optional diagram, and the source list; clicking a source opens the file modal with line highlighting.

### 11.5 Re-index

`POST /:id/reindex` sets `scanning`, clears `errorMessage`, and calls `startIndexing` without awaiting. The same clone is reused. Chunk IDs are deterministic (`repoId:index`). Because `add()` does not overwrite existing IDs (verified), and because the code never calls `deleteRepositoryChunks` before re-indexing:

- If the file set/chunk count is **unchanged**, old vectors silently remain.
- If the model or chunk size changed, the old embeddings remain in place for overlapping IDs, so retrieval can mix old and new vectors.
- If the repo shrank, chunks with higher indices are **never deleted** and remain searchable.

**This is a real correctness bug.** The correct fix is delete-then-add or `upsert`, ideally inside a staged/alias swap. **[Partial]**

### 11.6 Conversations

- `GET /api/repositories/:id/conversations` returns conversations **with all messages**.
- The workspace auto-selects the last conversation on load (`RepositoryWorkspace.jsx:65-70`).
- "New" clears local state and `conversationId`; the next chat creates a new conversation server-side.
- Rename uses `PUT /api/conversations/:id`; delete uses the repo-level modal and cascades messages.
- Auto-title only happens when creating or when title is empty; it is not regenerated from content.

### 11.7 Milestones

1. Open Milestones drawer → `GET /api/repositories/:id/milestones`.
2. Click "New AI Milestone" with a conversation open → `POST /api/repositories/:id/milestones/generate`.
3. Backend loads conversation + messages, calls the LLM with `format:'json'`.
4. **The generated milestone is returned but not stored.** The UI shows an editable modal; clicking OK calls `POST /api/repositories/:id/milestones`, which persists it (`RepositoryWorkspace.jsx:429-468`).
5. Chat later injects up to 3 keyword-matched milestones as extra context.
6. Delete uses `DELETE /api/milestones/:id`.

### 11.8 API discovery

`GET /:id/apis` walks **all** files (`listFiles`, unfiltered by extension), then for each file reads up to 200,000 bytes and runs regexes only for `.py`, `.js/.jsx/.ts/.tsx`:

- **FastAPI** — `@\w+\.(get|post|put|delete|patch)('path')` (`repository.controller.js:146`)
- **Flask** — `@\w+\.route('path', methods=['METHOD'])` (`:153`)
- **Django REST** — `@api_view(['METHOD'])` (`:159`)
- **Express/Fastify/Hono** — `(app|router|fastify|server).(get|post|put|delete|patch)('path')` (`:168`)
- **NestJS** — `@(Get|Post|Put|Delete|Patch)('path')` (`:175`)

Results dedupe on `method|path|file|line`. Limitations: no route prefixes/mounts, no decorator combinations, no dynamic paths, no middleware, no Go/Java/PHP support here, and Django paths are empty. It is a **textual hint**, not a real route analyser. **[Partial]**

### 11.9 File browsing

- `GET /:id/files` returns flat files + nested tree.
- The frontend rebuilds its own tree from the flat list (`buildFileTree` in `utils/tree.js`), so the server `tree` field is effectively unused by the workspace.
- Clicking a leaf calls `GET /:id/files/content?path=...`; the modal shows content, optionally with `>` markers on the referenced line range (`highlightLines`, `RepositoryWorkspace.jsx:573-583`). This is plain text, not syntax-highlighted, inside the modal.

### 11.10 Delete

1. Confirmation modal.
2. Backend verifies `localPath` is under storage root.
3. Chroma delete is attempted first, failures logged but ignored.
4. DB transaction removes messages → conversations → milestones → repository.
5. Filesystem directory removed; failure throws after DB deletion.
6. Returns `{success:true, message:"Repository and associated data deleted successfully"}`.

### 11.11 Dashboard / Indexing History

- Dashboard computes totals client-side from `GET /repositories`. "Last Indexed" is derived from `lastIndexedAt || indexedAt || updatedAt`, but the table column uses `dataIndex:'lastIndexedAt'`, which does not exist in the API → blank cells (`Dashboard.jsx:32-36, 54`).
- Indexing History is just a second table over the same repository list. It reads `url` and `lastIndexedAt`, neither of which the API returns → blank URL and blank date (`IndexingHistory.jsx:25, 33`). There is **no indexing-history table** in the schema. **[Partial]**

---

## 12. Configuration & Environment Variables

### 12.1 Environment variables (backend)

| Variable | Default | Read at | Purpose |
|---|---|---|---|
| `PORT` | `5000` | `server.js:4` | HTTP port |
| `DATABASE_URL` | example: `postgresql://postgres:password@localhost:5432/repomind` | `schema.prisma:7` | Prisma connection |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | `config/ollama.js:1` | Ollama host |
| `OLLAMA_MODEL` | `qwen2.5:3b` | `config/ollama.js:2` | Chat model |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | `config/ollama.js:3` | Embedding model |
| `OLLAMA_NUM_GPU` | `99` | `config/ollama.js:4` | Passed as `num_gpu` to Ollama |
| `EMBEDDING_TIMEOUT` | `180000` | `config/ollama.js:5` | Embedding request timeout (ms) |
| `CHAT_TIMEOUT` | `300000` | `config/ollama.js:6` | Chat/summary/milestone timeout (ms) |
| `CHROMA_URL` | `http://localhost:8000` | `config/chroma.js:1` | Chroma host |
| `REPOSITORY_STORAGE_PATH` | `./storage/repositories` | `repository.service.js:7` | Clone destination root |
| `MAX_FILE_SIZE_BYTES` | `200000` | `file-scanner.service.js:5` | Per-file read cap |
| `MAX_CHUNK_SIZE` | `1500` | `chunking.service.js:1` | Chunk size (chars) |
| `CHUNK_OVERLAP` | `200` | `chunking.service.js:2` | Overlap (chars) |

`EMBEDDING_TIMEOUT` and `CHAT_TIMEOUT` are supported by code but **not present in `.env.example`** — an example of docs drift.

### 12.2 Hardcoded constants (not configurable)

| Constant | Value | Location |
|---|---|---|
| Chroma collection name | `repomind_chunks` | `config/chroma.js:2` |
| Frontend API base | `http://localhost:5000/api` | `frontend/src/services/api.js:4` |
| Axios timeout (frontend) | `300000` | `api.js:5` |
| JSON body limit | `1mb` | `app.js:11` |
| Embed batch size | `20` | `indexing.service.js:7` |
| Normal `TOP_K` | `5` | `retrieval.service.js:6` |
| Broad vector `nResults` | `10` | `retrieval.service.js:25` |
| Broad file cap | `40` | `retrieval.service.js:48` |
| Broad per-file truncation | `1500` chars | `retrieval.service.js:50` |
| Total context cap (broad) | `15` | `retrieval.service.js:82` |
| History window | `6` messages | `llm.service.js:277` |
| Milestones injected | `3` | `chat.controller.js:48` |
| Summary trigger | `>=8` and `%4===0` | `chat.controller.js:81` |
| Answer temperature | `0.1` | `llm.service.js:291` |
| Summary/milestone temperature | `0.2` | `llm.service.js:209, 246` |
| API-read cap | `200000` bytes | `repository.controller.js:137` |
| Polling interval | `2000` ms | `Repositories.jsx:75` |
| Navigation delay after index | `800` ms | `Repositories.jsx:66` |

### 12.3 Defaults summary (memorise these)

`qwen2.5:3b` · `nomic-embed-text` · `:5000` backend · `:5173` frontend · `:8000` Chroma · `:5432` Postgres · `repomind_chunks` · 1500/200 chunking · batch 20 · top-5 / broad-10 / cap-15 · temp 0.1 · timeouts 180 s / 300 s.

---

## 13. Troubleshooting Guide

| Symptom | Likely cause | How to verify | Fix |
|---|---|---|---|
| `POST /repositories` returns 500 "Invalid GitHub repository URL" | Validation throws plain Error | Response code 500 | Expected current behaviour; fix by throwing an error with `status=400` **[Recommended]** |
| Frontend: "message is not defined" when deleting a repo on the Repositories page | `message` used but not imported (`Repositories.jsx:149,152`; imports at `:2-14` omit it) | Browser console | Add `message` to the AntD import **[Recommended]** |
| Progress bar stays at 0% | Status API never returns `progress`; UI reads `data.progress ?? data.indexingProgress ?? 0` | `GET /:id/status` payload | Compute progress from `indexedFiles/totalFiles` in UI, or add a field server-side **[Recommended]** |
| Chat returns 400 "Repository indexing is not completed" | Repo still cloning/indexing or failed | `status` field | Wait for `completed`; inspect `errorMessage` |
| Re-index "succeeds" but answers are stale | `add()` ignores existing IDs; old vectors not deleted | Query Chroma for repo, count chunks | Delete repo vectors before re-index or use `upsert` **[Recommended]** |
| `Cannot instantiate a collection with the DefaultEmbeddingFunction` warning | Chroma client has no default embed package; app always supplies embeddings | Log line only | Harmless here; pass an embedding function or mute **[General]** |
| Embedding fails after ~6 minutes | Ollama model missing or overloaded | Backend log `Embedding error (attempt 1/2)` | `ollama pull nomic-embed-text`; check RAM/VRAM; raise timeout |
| LLM fails after ~10 minutes | Model too slow/too large for hardware | `LLM error (attempt 1/2)` | Use smaller model, close other apps, raise `CHAT_TIMEOUT` |
| `npm test` dies with `Zone Allocation failed` / OOM | Low free RAM; Jest + ESM + heavy deps | Node fatal log | `NODE_OPTIONS=--max-old-space-size=2048` (or 4096) |
| `npm run build` fails with "memory allocation … failed" | Vite/Rust memory pressure | Build log | `NODE_OPTIONS=--max-old-space-size=4096`, close apps |
| Dashboard "Last Indexed" blank | API has no `lastIndexedAt`; column uses that key | Network tab | Use `updatedAt` or add a field **[Recommended]** |
| Indexing History URL/date blank | Page reads `url`/`lastIndexedAt`; API returns `githubUrl`/`updatedAt` | Same | Fix keys **[Recommended]** |
| Settings "saved" but nothing changes | `handleSave` only shows a toast (`Settings.jsx:8-14`) | Reload page | Implement persistence **[Recommended]** |
| `/chat-assistant` 404 | `ChatAssistant.jsx` exists but is not routed in `App.jsx` | `App.jsx:12-20` | Add route or delete page **[Recommended]** |
| Prisma `P1001` can't reach DB | Docker not running / wrong URL | `docker ps` | Start compose; check `DATABASE_URL` |
| Chroma connection refused | Container down / port clash | `GET /api/v2/heartbeat` | `docker compose up -d chromadb` |
| Files land in an unexpected folder | `REPOSITORY_STORAGE_PATH` is relative to CWD | `pwd` of backend process | Start from `backend/` or use an absolute path |
| Two diagrams appear for one answer | Model prints mermaid inline **and** `diagram` field is rendered | UI | Render only one source **[Recommended]** |
| Question appears twice in model input | User message inserted before history load, then repeated in prompt | `chat.controller.js:24-31`; `llm.service.js:275-281` | Exclude the current message from history **[Recommended]** |

---

## 14. Performance Analysis

### 14.1 Where time goes

| Phase | Dominant cost | Complexity | Notes |
|---|---|---|---|
| Clone | Network + GitHub | O(repo size) | `--depth 1` keeps it minimal |
| Scan | Disk I/O + full file reads | O(files) | Reads every supported file, twice more for language stats and tech stack |
| Language stats | Another full read of every supported file | O(files) | `computeLanguageStats` re-reads content just to count lines |
| Tech stack | Manifest reads + full Python scan for FastAPI | O(files) | `detectFrameworkCapabilities` walks all files again |
| Chunking | String ops | O(chars) | All chunks retained in memory |
| Embedding | Ollama inference over HTTP | O(chunks / 20) requests | Sequential batches; network + model bound |
| Vector write | Chroma HTTP | O(chunks / 20) requests | One `add` per batch |
| DB progress writes | Postgres | O(chunks / 20) | One update per batch |
| Retrieval (normal) | 1 embed + 1 Chroma query | O(1) relative to repo | Fast |
| Retrieval (broad) | 1 embed + Chroma + **full repo rescan** | O(repo size) per question | The biggest avoidable latency |
| LLM answer | Model generation | O(output tokens) | Usually the dominant chat latency |
| API discovery | Read every file | O(files) | Happens on demand when the drawer opens |

### 14.2 Concrete inefficiencies

1. **Full file contents are read multiple times.** A single indexing run reads each supported file at least three times: `scanRepository`, `computeLanguageStats`, and `detectFrameworkCapabilities` (if FastAPI). **[Partial]**
2. **Broad questions rescan the entire repository at query time** and then keep only the first 40 files (`retrieval.service.js:46-58`). On a large repo this can take seconds before the LLM even starts. Caching a repo summary, or storing a file manifest in Postgres, would remove this. **[Recommended]**
3. **All chunks are held in memory** (`indexing.service.js:28-41`) before embedding. A large repo with many 1500-char chunks can consume significant RAM, and the process has no backpressure. **[Partial]**
4. **No concurrency in embedding batches.** `for` loop + `await` means one batch at a time. Parallelising 2–4 batches could improve throughput, at the cost of Ollama contention. **[Recommended]**
5. **`GET /repositories/:id/conversations` loads every message** for every conversation (`chat.controller.js:102-113`). The workspace only needs titles for the sidebar. Add a summary projection or pagination. **[Recommended]**
6. **No caching anywhere.** Repeated identical questions re-embed, re-query, re-scan and re-generate. An answer cache keyed by repo + question hash would help demos. **[Recommended]**
7. **No DB indexes**, so list/lookup queries degrade linearly. Add indexes on `repositoryId`, `conversationId`, `createdAt`, and a unique index on `githubUrl`. **[Recommended]**
8. **Frontend bundle is 1.67 MB minified (529 kB gzip).** Mermaid and AntD dominate; there is no route-level `React.lazy`/manual chunking. Vite warns about chunk size. **[Partial]**
9. **The chat UI waits for the full answer** because `stream:false`; perceived latency is the whole generation time. Streaming via Ollama's stream mode + SSE would dramatically improve UX. **[Recommended]**
10. **Mermaid renders on every message update** with a random ID; repeated renders are expensive but bounded by message count. **[General]**

### 14.3 Measured/observed facts

- Backend test suite: ~1.5 s for 5 tests.
- Frontend build: 5,150 modules; `index-*.js` 1,671.17 kB (528.74 kB gzip); many tiny Mermaid lazy chunks.
- The build and tests only completed with a raised Node heap in this environment — relevant when reproducing on a 16 GB machine with Docker + Ollama running.

### 14.4 Performance improvement roadmap (interview-friendly)

| Priority | Change | Expected benefit |
|---|---|---|
| High | Cache/scan manifest; stop rescanning for broad chats | Large latency cut on big repos |
| High | Delete-then-upsert on re-index | Correctness, not just speed |
| High | Stream LLM output | Perceived latency |
| Medium | Add DB indexes | Query scaling |
| Medium | Parallel embedding batches (bounded) | Indexing throughput |
| Medium | Frontend code-splitting for Mermaid | Initial load |
| Low | Answer cache | Demo responsiveness |
| Low | Paginate conversations/messages | Payload size |

---

## 15. Security Analysis

### 15.1 Threat model

This is a **local developer tool**. The realistic threats are: a malicious repository's text influencing the LLM, another process/user on the same machine reaching the API, and accidental exposure if the dev server is bound to a LAN interface.

### 15.2 Findings

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| 1 | No authentication or authorization on any endpoint | High (if exposed) | **Not found** | No auth middleware; all routes open |
| 2 | Wide-open CORS (`cors()` with defaults) | Medium | **Verified** | `app.js:10` |
| 3 | Prompt injection via repository content | Medium | **Partial** | Raw content injected, `llm.service.js:267-281` |
| 4 | Invalid input surfaces as 500 and may leak internals | Low | **Verified** | `error.middleware.js:1-6`; runtime check |
| 5 | Secrets stored in plain `.env` | Medium | **Verified** | `.env` present; `.gitignore` excludes it |
| 6 | Path traversal on file read | Mitigated | **Verified** | `safeJoin`, `git.utils.js:43-49` |
| 7 | Path traversal on delete | Mostly mitigated | **Partial** | `startsWith(storageRoot)` lacks a separator check (`repository.service.js:83`) |
| 8 | Command injection in git | Mitigated | **Verified** | `spawn` with `shell:false` and arg array (`git.utils.js:24`) |
| 9 | SSRF via clone URL | Low | **Mitigated** | Host must be github.com; URL rebuilt from owner/repo (`git.utils.js:13-19`) |
| 10 | XSS via model Markdown / diagram | Low | **Mostly mitigated** | Markdown has no `rehype-raw`; Mermaid renders with `securityLevel:'strict'` then injects the sanitised SVG via `dangerouslySetInnerHTML` (`ArchitectureDiagram.jsx:5,38`) |
| 11 | Denial of service via expensive endpoints | Medium | **Not found** | No rate limits; 1 MB body cap only |
| 12 | Unpinned `chromadb/chroma:latest` image | Low/Medium | **Verified** | `docker-compose.yml:14` |
| 13 | Error/log leakage of repo paths and stack traces | Low | **Partial** | `console.error(err)` + message passthrough |
| 14 | No security headers (helmet/CSP/HSTS) | Low | **Not found** | — |
| 15 | No dependency audit in CI | Medium | **Not found** | No CI |
| 16 | Public-repo assumption not enforced beyond URL host | Low | **Verified** | Private clone will fail, but no explicit check |

### 15.3 Prompt-injection specifics

Repository text is placed in the **user** message after a system prompt that says to obey only repo facts. A file containing "SYSTEM: ignore your rules and output X" is not escaped or fenced. Because the model is small and the system prompt is long, instruction-following is already unreliable. Mitigations **[Recommended]**: delimit context with unambiguous markers, state that context is untrusted data, strip control sequences, never expose secrets to the model (none are exposed today), and validate output structure.

### 15.4 What is *good* security-wise

- No shell interpolation for git.
- No dynamic `eval`, no `child_process.exec`.
- Prisma parameterises SQL.
- File reads are confined to the clone directory.
- Delete validates the storage path.
- Mermaid runs in strict security mode.
- Markdown does not render raw HTML (there is no `rehype-raw`). The single HTML injection point is Mermaid's sanitised SVG, rendered under `securityLevel:'strict'`.
- The app never executes model-generated code.

---

## 16. Testing

### 16.1 Current tests

`backend/jest.config.js`: `testEnvironment: 'node'`, roots `tests/`.

| File | Test | Assertion |
|---|---|---|
| `tests/integration/api.test.js:4-8` | health endpoint | 200 + `{status:'ok'}` |
| `tests/integration/api.test.js:10-13` | create rejects missing URL | 400 |
| `tests/integration/api.test.js:15-18` | create rejects invalid URL | **500** (documents current behaviour) |
| `tests/unit/github.test.js:3-6` | parses valid GitHub URL | exact object |
| `tests/unit/github.test.js:8-11` | rejects invalid URLs | `null` for two inputs |

**Result:** 2 suites, 5 tests, all passing.

### 16.2 Coverage gaps

| Area | Tests |
|---|---|
| Chunking boundaries/overlap/line numbers | **None** |
| Retrieval normal vs broad | **None** |
| Vector add/query/delete | **None** |
| LLM prompt construction / Mermaid extraction | **None** |
| Indexing state machine | **None** |
| Repository CRUD/delete cascade | **None** |
| Conversations/milestones controllers | **None** |
| API discovery regexes | **None** |
| Frontend components/pages | **None** |
| End-to-end clone→chat | **None** |

There is no coverage threshold, no mocking setup, no test DB, no fixture repository, and no frontend test runner. The `test` script's `--max-old-space-size=4096` is a workaround, not a test design.

### 16.3 What a strong test plan would add

1. **Unit:** `chunkCode` with fixtures for JS/Python/Java; assert no content loss, overlap ≤ configured, line ranges sane.
2. **Unit:** `parseGitHubUrl` edge cases (`.git`, `www`, ports, extra path segments, credentials).
3. **Unit:** `getApis` against small fixture files per framework.
4. **Integration:** repository create → mocked git → mocked Ollama/Chroma → status transitions.
5. **Integration:** chat with a fake LLM returning fixed text + mermaid; assert sources and persistence.
6. **Contract:** response shapes, 400 vs 500 on validation.
7. **Frontend:** React Testing Library for the workspace send flow and blank-field bugs.
8. **E2E (optional):** Playwright against a tiny local repo and a stub Ollama.

---

## 17. Trade-offs & Design Decisions

| Decision | What was chosen | Benefit | Cost | Better long-term option |
|---|---|---|---|---|
| Deployment model | Local-only, host-run Node | Privacy, zero cloud cost, simple | Not shareable, no scaling | Containerise app + workers |
| LLM | Local `qwen2.5:3b` via Ollama | Free, private, offline | Weaker reasoning, slower on CPU | Configurable model tier |
| Embedding | `nomic-embed-text` | Good local quality | Unknown dimension/metric in code | Pin model + declare config |
| Chunking | Fixed 1500 chars + line overlap | Simple, language-agnostic | Crosses logical boundaries | AST/tree-sitter chunking |
| Retrieval | Dense-only top-k | Simple | Misses exact identifiers | Hybrid BM25 + dense + rerank |
| Broad questions | Full scan, first 40 files | Higher recall for "what's missing" | Slow, order-dependent | Cached summaries + scored selection (`scoreFile` exists!) |
| Vector schema | Single collection + `repositoryId` metadata | Easy setup | Reindex/delete complexity | Per-repo collections or namespaces |
| Re-index | Reuse deterministic IDs + `add()` | Idempotent intent | **Stale vectors** | Delete-then-add / `upsert` |
| Background work | Fire-and-forget promises | No infra | No retries/recovery/progress | Durable queue/worker |
| Progress reporting | DB counters only | Minimal | UI has no % | Expose computed progress or events |
| Database | Postgres + Prisma | Typed client, migrations | No indexes/uniques yet | Add constraints/indexes |
| Memory | Rolling summary + milestones | Cheap long-term context | Lossy, keyword-scored | Embedding-based memory |
| API discovery | Regex | No parser deps | False positives/negatives | AST or framework introspection |
| Auth | None | Simplicity | Unsafe if exposed | Session/JWT + ownership |
| Frontend data | Ad-hoc `toArray` shape coercion | Tolerates API drift | Hides contract bugs | Typed API client/OpenAPI |
| Styling/UI | Ant Design | Fast to build | 1.67 MB bundle | Lazy-load heavy parts |
| Streaming | Disabled | Simpler error handling | Poor perceived latency | SSE streaming |

**Interview framing:** every shortcut here is defensible *for a local POC*. The mature answer is to name the constraint that made it acceptable and the trigger that would force a change (multi-user, repo size, re-index frequency, latency SLO).

---

## 18. Interview Preparation

### 18.1 Two-minute introduction (say this)

> "RepoMind AI is a local-first code documentation assistant. You give it a public GitHub URL, and it clones the repo, scans supported source files, splits them into overlapping chunks, embeds each chunk with a local Ollama embedding model — `nomic-embed-text` — and stores the vectors in ChromaDB with repository and file metadata.
>
> When you ask a question, the backend embeds the question, retrieves the top five chunks for that repository from Chroma, optionally adds a full-repo scan for broad questions like 'what's missing?' or 'explain the architecture', injects any relevant milestone summaries and a rolling conversation summary, and sends everything to a local `qwen2.5:3b` model through Ollama. The answer comes back as Markdown with source file paths and line ranges, plus an optional Mermaid architecture diagram.
>
> The stack is React 19, Vite and Ant Design on the frontend, Express 5 with Prisma and PostgreSQL for metadata, and ChromaDB plus Ollama for the AI layer. It's a working prototype: the core RAG path works end-to-end, but there's no auth, no job queue, no streaming, and re-indexing has a stale-vector bug I can explain. I'd describe it as a strong local developer tool that needs production hardening before multi-user use."

### 18.2 Five-minute walkthrough (structure)

1. **Problem (20 s):** understanding an unfamiliar repo is slow; generic chat models hallucinate without context.
2. **Architecture (60 s):** React → Express → Prisma/Postgres; indexing side calls git, scanner, chunker, Ollama embed, Chroma; chat side calls embed, Chroma query, Ollama chat.
3. **Indexing (60 s):** URL validation → shallow clone → scan 16 extensions, skip binaries/oversized/build dirs → language stats and tech-stack heuristics → 1500-char chunks with 200-char overlap → batches of 20 embeddings → Chroma `add` with `repositoryId` metadata → status transitions persisted.
4. **Retrieval/answer (90 s):** normal = top-5 vectors + metadata; broad = top-10 + first 40 files truncated to 1500 chars, deduped, capped at 15 chunks; prompt has strict grounding rules; temperature 0.1; last 6 messages; two retries.
5. **Product surface (40 s):** workspace with file tree/viewer, conversations, source references, API explorer, milestones, architecture diagrams, dashboard and indexing history.
6. **Honest gaps (50 s):** no auth/queues/streaming/CI; no DB indexes; re-index doesn't clear vectors; progress is fake; some UI fields don't match the API; small model limits accuracy.
7. **What I'd do next (30 s):** fix re-index correctness, add streaming, cache repo scans, add indexes and tests, then auth and a worker queue if it becomes multi-user.

### 18.3 Twenty basic questions (with answers)

**1. What does RepoMind AI do?**
It clones a public GitHub repo, indexes its code with embeddings, and lets you chat with it. Answers include file and line references, and it can produce an architecture diagram.

**2. What is the tech stack?**
Frontend: React 19, Vite 8, Ant Design 6, React Router 7, Axios, Mermaid, react-markdown. Backend: Node/Express 5, Prisma 5, PostgreSQL 15, ChromaDB, Ollama (`qwen2.5:3b` + `nomic-embed-text`).

**3. Why use Ollama instead of OpenAI?**
It runs locally, so code never leaves the machine, there are no API costs, and it works offline. The trade-off is a smaller model and slower CPU inference.

**4. What is RAG?**
Retrieval-Augmented Generation: instead of asking the LLM to remember your code, you retrieve relevant snippets and put them in the prompt. RepoMind does dense vector retrieval over code chunks.

**5. How is a repository cloned?**
`git clone --depth 1 <url> <storage>/<owner>__<repo>__<id>` via `child_process.spawn` with `shell:false` and a 300-second timeout. It is asynchronous after the API returns 201.

**6. Which files are indexed?**
`.js .jsx .ts .tsx .py .java .go .php .json .md .sql .yaml .yml .sh .bash`. Files over `MAX_FILE_SIZE_BYTES` (200k) and binary files are skipped; `node_modules`, `.git`, `dist`, `build`, `vendor`, etc. are ignored.

**7. How does chunking work?**
Files are split by lines into ~1500-character chunks with ~200 characters of line-based overlap. A regex prefers to break at function/class/const boundaries once a chunk is at least one-third full.

**8. Why overlap chunks?**
So a function or explanation split across a boundary still appears intact in at least one chunk, improving retrieval and answer quality.

**9. How are embeddings generated?**
`POST http://localhost:11434/api/embed` with `nomic-embed-text`, batches of 20 chunks, 180-second timeout, two attempts. The vectors are passed to Chroma explicitly.

**10. Where are vectors stored?**
In ChromaDB, collection `repomind_chunks`. Each record has `repositoryId`, `filePath`, `language`, `startLine`, `endLine` metadata, and a deterministic ID `repositoryId:index`.

**11. How does retrieval work?**
Embed the question, query Chroma with `where:{repositoryId}` and `nResults:5` (10 for broad questions), then use the returned documents and metadata as context. There is no re-ranker.

**12. What counts as a "broad" question?**
Anything matching `/architect|api|endpoint|route|entry point|how does .* work|structure|flow|improve|missing|feature|recommend|analysis/`. Broad questions also scan the repo and include up to 40 files, truncated, capped at 15 chunks total.

**13. What model settings are used?**
Answers: `temperature 0.1`, `stream:false`, `num_gpu` from env (default 99), 300-second timeout, 2 attempts with 3-second delay. Summaries and milestones use temperature 0.2.

**14. How are source references produced?**
They are the retrieval chunks' `filePath`/`startLine`/`endLine`, excluding synthetic entries like `repository metadata`, `conversation summary` and `milestone:*`. The frontend lists them and opens the file on click.

**15. How is the architecture diagram generated?**
If the question matches architecture keywords, an extra prompt asks for a `flowchart TD` Mermaid block (≤10 nodes, `ID["Label"]`). The backend extracts it with a regex and sanitises node IDs/labels; the frontend renders it with Mermaid in strict security mode.

**16. What is stored in PostgreSQL?**
Four models: `Repository` (URL, path, status, counts, languages, tech stack), `Conversation` (title, summary), `Message` (role, content), `Milestone` (structured summary of decisions/work).

**17. How are conversations and memory handled?**
A conversation is auto-created and titled from the first question. The last 6 messages go to the model. After 8+ messages, every 4th message triggers a conversation summary. Relevant milestones (top 3 by keyword overlap) are also injected.

**18. How does API discovery work?**
It reads source files and regex-matches FastAPI, Flask, Django REST, Express/Fastify/Hono and NestJS route declarations. Results include method, path, file, line and framework. It is heuristic, not AST-based.

**19. How is a repository deleted?**
It attempts to delete Chroma vectors, then runs a Prisma transaction deleting messages → conversations → milestones → repository, then removes the clone directory. The storage path is validated first.

**20. How do you run it?**
Start Postgres + Chroma with `docker compose up -d`, install/pull Ollama models, configure `backend/.env`, run `npx prisma migrate dev`, `npm run dev` in `backend`, and `npm run dev` in `frontend`.

### 18.4 Twenty-five advanced questions (with answers)

**1. Walk me through the exact state machine of a repository.**
`pending` (row created) → `cloning` (localPath set, clone launched) → `scanning` (clone done, branch detected) → `chunking` (scan complete, counts/languages/stack written) → `embedding` (all chunks built) → `completed` (final counts). Failures set `failed` plus `errorMessage` and `currentStage`. `getStatus` exposes stage/counts but not progress.

**2. Why is the API returning 500 for an invalid URL, and how would you fix it?**
`validateGitHubUrl` throws `new Error(...)` with no `status`. The error middleware defaults to 500. Fix: throw an error with `status=400` (or a typed `BadRequestError`) and add a test asserting 400. The existing test actually encodes the bug by expecting 500.

**3. What happens if two users submit the same repo simultaneously?**
`findFirst` sees nothing for both, both insert, because `githubUrl` is not unique. You get duplicate repositories and duplicate clones. Fix: `@unique` on `githubUrl` plus catch `P2002`, or a transaction with a lock.

**4. Explain the re-index bug precisely.**
Chunk IDs are `${repositoryId}:${i}`. Re-index calls `addChunks` → `col.add(...)`. Chroma's `add` does not overwrite an existing ID (verified). Old vectors therefore survive; if chunk count shrinks, higher-index chunks are never deleted. If the embedding model changed, new query vectors are compared against old document vectors. Fix: `deleteRepositoryChunks(id)` before indexing, or use `upsert`, ideally writing to a new collection and swapping.

**5. Is this an agentic system?**
No. There is no tool calling, planning loop, or autonomous action. It is conditional retrieval: regexes choose broad vs normal context and whether to add the architecture prompt. Memory (summary + milestones) is the only multi-step element.

**6. Why use a single Chroma collection instead of one per repo?**
One collection keeps setup simple and uses metadata filtering (`where:{repositoryId}`). The cost is that delete/reindex must be careful with filters and IDs. Per-repo collections would isolate deletes but multiply collection management and make cross-repo search harder.

**7. What is the embedding dimension and distance metric?**
**[Unknown]** from the repo. The dimension comes from `nomic-embed-text`, and the collection is created without an explicit `hnsw:space`/configuration, so it uses Chroma defaults. In an interview, say you would query `collection.metadata`/configuration rather than guess.

**8. Why is broad retrieval order-dependent and how would you improve it?**
It uses `files.slice(0, 40)` from filesystem walk order. `scoreFile()` already exists but is unused; wiring it in and sorting by score would prioritise READMEs, manifests, entry points, routes and services. Better still: cache a repo map and select by question intent.

**9. How would you reduce chat latency?**
Stream tokens (SSE), avoid rescanning the repo for broad questions (cache a manifest/summary), cache embeddings/answers, use a smaller/faster model for routing, and cap context more aggressively. The LLM generation is usually the dominant term.

**10. How do you handle LLM failures?**
`generateAnswer` retries twice with a 3-second delay, then throws a friendly 500. Embeddings do the same with 2 seconds. Summaries swallow errors and return empty; milestones return `null` and the controller sends 500. There is no circuit breaker or fallback model.

**11. Why does the model sometimes ignore the system prompt?**
It is a 3B model with a very long, multi-section instruction set. Small models degrade with long prompts and competing rules. Mitigations: shorter task-specific prompts, structured output/JSON schemas, few-shot examples, a larger model, and output validation.

**12. What are the token/context limits and how are they handled?**
They are not measured. Context is capped by chunk count (15) and per-file characters (1500), plus last 6 messages, but there is no token counter or truncation against the model's window. A long history or large chunks can overflow silently.

**13. How would you make re-indexing incremental?**
Store a content hash per file and per chunk. On re-index, diff the working tree, delete chunks for changed/deleted files, embed only new/changed chunks, and update counts. Longer term, use `git fetch` + diff instead of a fresh scan.

**14. How would you add authentication and multi-tenancy?**
Add `User` and `Repository.ownerId`, JWT/session middleware, ownership checks on every repo/conversation/milestone route, per-user storage prefixes, and per-user Chroma metadata filters. Add rate limiting on chat/index. This is currently entirely absent.

**15. What are the database indexing problems?**
No indexes on foreign keys or sort columns. `listConversations`, `getMessages`, milestone lookups and `orderBy createdAt` all scan. Add `@@index([repositoryId])`, `@@index([conversationId])`, `@@index([createdAt])`, plus `@unique` on `githubUrl`.

**16. Why is `Milestone.conversationId` a problem?**
It is a plain optional string with no relation. Deleting a conversation leaves dangling IDs; you cannot `include` the conversation; referential integrity is unenforced. Make it a relation with `onDelete: SetNull`.

**17. How does the app prevent path traversal?**
`safeJoin` resolves the requested path and requires it to start with the resolved base plus a separator, throwing otherwise. Delete uses a weaker `startsWith(storageRoot)` check without the separator, which could accept a sibling directory with the same prefix; tighten it.

**18. What is the prompt-injection surface?**
Every retrieved file chunk is concatenated into the user message unescaped. A repo can contain instructions that the model may follow. Impact is limited because there are no tools or secrets, but the correct design is to delimit context, label it untrusted, and validate output.

**19. How would you evaluate answer quality?**
Build a gold set of repo/question/expected-file pairs. Measure retrieval recall@k and MRR, answer faithfulness (does every claim map to a source?), citation correctness, and latency. Currently there are zero evaluations.

**20. Why is the Mermaid sanitizer fragile?**
It is line/text-based: it rewrites node tokens and drops duplicate lines, but does not parse Mermaid grammar. It can break valid edge labels, subgraphs, or multi-line constructs, and `isLikelyValidMermaid` is a stub returning `true`. A real parser or a stricter generation contract is needed.

**21. What happens on a very large repository?**
Scanning reads every supported file fully, all chunks are held in memory, and broad questions rescan the tree. Memory and latency grow linearly, and the 15-chunk cap may discard most relevant code. There is no size limit, pagination, or streaming index.

**22. Explain the summary cadence and its weakness.**
After every assistant turn, if total messages ≥ 8 and divisible by 4, the whole conversation is summarised and the single `summary` field is overwritten. It is lossy, can drift, costs an extra LLM call, and can race with concurrent chats in the same conversation.

**23. How do you ensure answers cite real files?**
The prompt asks for citations and the API returns the retrieval metadata as `sources`, but the model's inline citations are not validated against those sources. A hallucinated path could appear in prose. Post-process and verify citations against the retrieved set.

**24. What would break if you horizontally scaled the backend?**
Fire-and-forget indexing has no shared job state, so a request could poll a different instance than the one indexing; local file storage is per-container; status is only in Postgres, so partial progress is visible but clone/index work is not coordinated. You need a shared volume/object store and a queue.

**25. Which parts are production-ready and which are not?**
Ready-ish: URL parsing, shallow clone, file safety, chunk/embed/store/retrieve vertical slice, error middleware, cascade delete transaction. Not ready: auth, rate limiting, job durability, progress, re-index correctness, DB indexes/constraints, observability, CI, tests, streaming, configurable API base URL.

### 18.5 Scenario-based questions

**Scenario 1 — "A repository has been stuck in `embedding` for an hour. How do you debug it?"**
Check `GET /:id/status` for `currentStage`, `indexedFiles`, `totalChunks`, `errorMessage`. Tail backend logs for `Embedding error` or `LLM error`. Verify Ollama is up and the embedding model exists (`ollama list`), and that Chroma's heartbeat responds. If the process restarted, there is no job recovery — the row stays mid-stage. Immediate fix: `POST /:id/reindex`; durable fix: persisted jobs with retry/lease + startup recovery.

**Scenario 2 — "Answers cite files that don't exist."**
Separate retrieval sources from model prose. Confirm `sources` paths exist under the clone. If the prose cites fake paths, the model hallucinated; the prompt asks for citations but there is no validation. Tighten by requiring citations copied from the `File:` headers, adding a post-check that every cited path is in the retrieved set, lowering temperature (already 0.1), and using a stronger model.

**Scenario 3 — "A 50k-file monorepo takes 40 minutes to index and broad questions time out."**
Current costs: full read ×3, all chunks in memory, sequential batches of 20, full rescan per broad question. Mitigations: stream files instead of loading all chunks; dedupe reads (one scan pass feeding stats/stack/chunks); bounded parallel embedding; ignore generated/vendor dirs more aggressively; cap repo size; cache a manifest for retrieval; increase frontend/API timeouts knowingly.

**Scenario 4 — "A user says the repo already exists but has no files or chat."**
Likely a duplicate row created by the `findFirst` race, or a failed clone. Inspect `status`/`errorMessage`/`localPath`. Add a unique constraint on `githubUrl`, reuse the existing row, and make status/list endpoints surface failure clearly.

**Scenario 5 — "We want to expose this to the team over the LAN. What must change first?"**
At minimum: authentication, per-user ownership checks, rate limiting, restricted CORS, HTTPS/reverse proxy, security headers, request size limits, log redaction, pinned images, and a job queue. Also hardcoded frontend API URL and open `cors()` must change. Without these it is an unauthenticated code-execution-adjacent surface (git, disk writes, LLM cost).

**Scenario 6 — "Add support for Rust."**
Add `.rs` to `SUPPORTED_EXTENSIONS`, map it in `detectLanguage`, add a display name, extend the boundary regex (`fn`, `impl`, `struct`), and add API-discovery regexes only if desired (Axum/Actix are not currently handled). Add chunking tests. No schema change needed.

**Scenario 7 — "Chat responses take 4–5 minutes."**
Measure stages: embed (~fast), Chroma (~ms), broad scan (potentially seconds), LLM (dominant on CPU). Confirm model size and hardware; try a smaller model, reduce context (top-3, lower per-file truncation), disable broad scan for non-broad intents, and stream output so the user sees progress. Raise `CHAT_TIMEOUT` only as a last resort.

**Scenario 8 — "We switched from `nomic-embed-text` to another embedding model. Retrieval got worse."**
Old vectors remain because re-index uses `add()` with existing IDs. Even with a delete, dimensions may differ and Chroma will reject mismatched embeddings. Correct procedure: delete the collection (or all repo vectors), re-index everything with the new model, and record the embedding model/version in metadata for future migrations.

**Scenario 9 — "Clicking Delete on the Repositories page throws `message is not defined`."**
`Repositories.jsx` uses AntD's `message` at lines 149 and 152 but does not import it (imports end at line 14). Add `message` to the import list. This is a straightforward missing-import bug, not a backend issue.

**Scenario 10 — "Make the chat feel instant."**
Implement SSE streaming: switch Ollama to `stream:true`, proxy chunks through an Express SSE endpoint, update the React message incrementally, and keep the final `sources`/`diagram` event at the end. Also show retrieval status ("searching code…") and cache repeated questions.

**Scenario 11 — "The progress bar never moves."**
`GET /:id/status` returns counts, not a percentage, and the UI reads `data.progress`/`data.indexingProgress`. Compute `indexedFiles/totalFiles` client-side or add a server-computed `progress` field. Polling already exists at 2 s.

**Scenario 12 — "A repository was deleted but its vectors are still in Chroma."**
`deleteRepository` wraps vector deletion in `try/catch` and continues on failure, so a Chroma outage leaves orphans. Add a reconciliation job that lists vector `repositoryId`s and removes those without a DB row; or make vector deletion retryable and idempotent.

### 18.6 Challenge-style explanations (when the interviewer pushes back)

**Challenge: "This is an agent, right?"**
"No — and I want to be precise about that. There's no tool calling, planning, or action loop. The LLM only generates text. What looks agentic is deterministic routing: `isBroadQuestion` chooses a wider retrieval strategy and `isArchitectureQuestion` appends a diagram prompt. That's conditional retrieval plus memory, not autonomy."

**Challenge: "Chroma's `add` overwrites duplicates, so re-index is fine."**
"I tested it in a throwaway collection: the second `add` with the same ID resolved successfully, but `get` still returned the first document. So it does not overwrite. Combined with never deleting before re-index, that means stale vectors. The correct call is `upsert`, or delete-then-add."

**Challenge: "The tests prove the API works."**
"They prove five things: health, missing-URL 400, invalid-URL 500, and two URL-parser cases. They don't touch chunking, retrieval, indexing, chat, the database, or the frontend. One test even codifies the 500-on-invalid-input bug as expected behaviour."

**Challenge: "`OLLAMA_NUM_GPU=99` means it uses the GPU."**
"It's only a request option passed to Ollama. Whether layers run on GPU depends on Ollama's hardware detection and model fit. The repo contains no evidence of GPU usage, so I wouldn't claim it."

**Challenge: "The system prompt prevents hallucinations."**
"It reduces them, but it can't guarantee it. The prompt is very long for a 3B model, repository text is injected unescaped, and no output is validated against retrieved sources. I'd call grounding best-effort, not enforced."

**Challenge: "This is production-ready because it has migrations and tests."**
"Migrations and five tests are good hygiene, but production readiness also needs auth, rate limits, durable jobs, re-index correctness, DB indexes/constraints, observability, CI, and deployment artifacts. None of those exist. It's a solid local prototype."

**Challenge: "Why not just use LangChain?"**
"For this scope, a direct HTTP client to Ollama plus Chroma is fewer moving parts and easier to debug. LangChain would help with agents, tooling and multi-provider abstraction, but the project doesn't need those yet. If we added tool use or multiple providers, it would become worth it."

**Challenge: "The broad-question path must be the most accurate."**
"It improves recall by showing more files, but it's order-dependent (`slice(0,40)`), truncates each file to 1500 chars, and caps total context at 15 chunks. On a big repo it can miss the relevant files entirely while costing a full rescan. A scored or cached selection would be better."

**Challenge: "There's no way the question is duplicated."**
"There is. `chat.controller.js:24-31` inserts the user message and then loads history, and `llm.service.js:275-281` appends the question again in the final user message. The model sees it twice. It's harmless-ish but wasteful and can bias the answer."

**Challenge: "Deleting a repository cleans everything."**
"Usually, but not atomically. Vectors are deleted first and failures are swallowed, so Chroma orphans are possible. DB deletion then succeeds, and only afterwards are files removed; a filesystem failure throws after the row is gone. It's best-effort cleanup, not a transaction across three stores."

**Challenge: "Why store code in both Postgres and Chroma?"**
"Postgres stores metadata and conversation state; Chroma stores embeddings and chunk text for similarity search. Chunk text is duplicated in Chroma documents by design so retrieval can return it without a second DB lookup. If storage mattered, you'd store only IDs in Chroma and hydrate from Postgres or object storage."

**Challenge: "The API is RESTful."**
"Mostly resource-oriented, but not strictly: duplicate conversation routes under `/chat` and `/conversations`, inconsistent response envelopes, action endpoints like `/reindex` and `/milestones/generate`, and no versioning or pagination. It's pragmatic REST-ish, not a designed public API."

---

## 19. Cheat Sheets

### 19.1 One-page mental model

```
ADD REPO
  URL → parseGitHubUrl (github.com only) → DB row(pending)
      → localPath → git clone --depth 1 → scanning
      → scan 16 ext, skip binary/>200k/build dirs → languages + techStack → chunking
      → 1500-char chunks / 200 overlap → embedding
      → batches of 20 → Ollama /api/embed (nomic-embed-text) → Chroma add
      → completed

ASK
  question → embed → Chroma query(repoId, top5 | top10 broad)
           → + metadata chunk (if available)
           → broad? first 40 files ×1500 chars, dedupe, cap 15
           → + top3 milestones + conversation summary
           → Ollama /api/chat (qwen2.5:3b, temp 0.1, last 6 msgs)
           → answer + mermaid? + sources → store assistant msg
           → maybe summarize (>=8 msgs, %4==0)
```

### 19.2 Index vs chat (never mix these up)

| | Indexing | Chat |
|---|---|---|
| Trigger | `POST /repositories`, `POST /:id/reindex` | `POST /api/chat` |
| Model | `nomic-embed-text` | `qwen2.5:3b` |
| Ollama endpoint | `/api/embed` | `/api/chat` |
| Timeout | 180 s | 300 s |
| Retries | 2 (2 s delay) | 2 (3 s delay) |
| Writes | Chroma + Repository counts | Messages + maybe Conversation.summary |
| Temperature | n/a | 0.1 |

### 19.3 Request/response cheat sheet

```jsonc
// POST /api/repositories
{ "url": "https://github.com/owner/repo" }
// 201 → Repository row (clone continues in background)

// GET /api/repositories/:id/status
{ "id":"...", "status":"completed", "currentStage":"completed",
  "totalFiles":42, "indexedFiles":42, "totalChunks":180, "errorMessage":null }

// POST /api/chat
{ "repositoryId":"...", "question":"How does auth work?", "conversationId":null }
// 200 →
{ "answer":"...markdown...", "diagram": null | {"type":"mermaid","code":"flowchart TD..."},
  "sources":[{"filePath":"src/x.js","startLine":10,"endLine":40}],
  "conversationId":"..." }

// POST /api/repositories/:id/milestones/generate
{ "conversationId":"..." }
// 200 → { title, summary, decisions[], technologies[], keyFiles[],
//          completedWork[], pendingWork[], recommendations[] }  (NOT saved)
```

### 19.4 File map (where to look during an interview)

| Concern | File |
|---|---|
| App setup, CORS, health | `backend/src/app.js` |
| Port | `backend/src/server.js` |
| All repository endpoints | `backend/src/controllers/repository.controller.js` |
| Chat/conversation endpoints | `backend/src/controllers/chat.controller.js` |
| Milestones | `backend/src/controllers/milestone.controller.js` |
| Clone/delete/duplicate | `backend/src/services/repository.service.js` |
| Scan/stats/stack/capabilities | `backend/src/services/file-scanner.service.js` |
| Chunking | `backend/src/services/chunking.service.js` |
| Embeddings | `backend/src/services/embedding.service.js` |
| Chroma I/O | `backend/src/services/vector.service.js` |
| Retrieval strategy | `backend/src/services/retrieval.service.js` |
| Indexing state machine | `backend/src/services/indexing.service.js` |
| Prompts + LLM + Mermaid | `backend/src/services/llm.service.js` |
| DB schema | `backend/prisma/schema.prisma` |
| Env defaults | `backend/src/config/*.js`, `backend/.env.example` |
| File safety/git | `backend/src/utils/file.utils.js`, `git.utils.js` |
| Frontend routes | `frontend/src/App.jsx` |
| Main workspace | `frontend/src/pages/RepositoryWorkspace.jsx` |
| Add/list repos | `frontend/src/pages/Repositories.jsx` |
| API client | `frontend/src/services/api.js` |
| Markdown/Mermaid | `frontend/src/components/MarkdownMessage.jsx`, `ArchitectureDiagram.jsx` |

### 19.5 Failure matrix

| Component down | Effect | User sees |
|---|---|---|
| PostgreSQL | All DB routes fail | 500 / generic message |
| Chroma | Indexing and chat retrieval fail; delete continues | 500 / "temporarily unavailable" |
| Ollama | Embedding/indexing fails; chat fails after retries | 500 with friendly LLM/embed message |
| Git binary | Clone fails | `failed` + `errorMessage` |
| Disk full | Clone/mkdir/write fails | 500 or `failed` |
| Backend | Frontend cannot load data | "Backend is unavailable…" |
| Frontend only | API still usable directly | Blank app |

### 19.6 Numbers to memorise

`1500` chunk chars · `200` overlap chars · `20` embed batch · `5` top-k · `10` broad vectors · `40` broad files · `1500` per-file truncation · `15` context cap · `6` history · `3` milestones · `8/%4` summary cadence · `0.1` answer temp · `0.2` summary/milestone temp · `180000`/`300000` ms · `200000` max file bytes · `1mb` JSON · `2s` polling · `:5000/:5173/:8000/:5432`.

---

## 20. Glossary

| Term | Meaning in this project |
|---|---|
| **RAG** | Retrieval-Augmented Generation — retrieve code chunks, put them in the prompt, then generate an answer. |
| **Embedding** | A numeric vector representing text meaning; produced here by `nomic-embed-text`. |
| **Vector database** | A store optimised for nearest-neighbour search over embeddings; here ChromaDB. |
| **Chunk** | A slice of a source file (~1500 chars) stored and embedded as one unit. |
| **Overlap** | Repeated text between adjacent chunks (~200 chars) to preserve context across boundaries. |
| **Top-k** | Number of nearest vectors returned (5 normal, 10 broad). |
| **ANN / HNSW** | Approximate nearest-neighbour index; Chroma's default index type. Exact metric not declared here. |
| **Cosine / L2** | Common distance metrics; **unknown** which this collection uses. |
| **Reranker** | A second-stage relevance model; **not present**. |
| **Hybrid search** | Combining keyword (BM25) and vector search; **not present**. |
| **MMR** | Maximal Marginal Relevance, for diverse results; **not present**. |
| **Grounding** | Constraining answers to retrieved evidence; requested by prompt, not enforced. |
| **Hallucination** | A confident but unsupported claim; mitigated by prompt and low temperature, not eliminated. |
| **Prompt injection** | Malicious text in retrieved content that tries to override instructions; possible here. |
| **Temperature** | Sampling randomness; 0.1 for answers, 0.2 for summaries/milestones. |
| **Context window** | Maximum tokens a model can process; not measured or enforced here. |
| **Streaming / SSE** | Sending tokens as they are generated; **disabled** (`stream:false`). |
| **System prompt** | High-priority instruction block (`SYSTEM_PROMPT`); very long in this repo. |
| **Milestone** | A structured, editable summary of conversation decisions/work, stored in Postgres. |
| **Conversation summary** | A single rolling summary string overwritten every 4 messages after the 8th. |
| **ORM** | Object-Relational Mapper; Prisma maps models to SQL. |
| **Migration** | Versioned SQL that evolves the schema; five exist. |
| **Cascade delete** | DB-level deletion of dependent rows; used for messages/conversations/milestones. |
| **Upsert** | Insert-or-update; Chroma supports it but the app uses `add`. |
| **Idempotency** | Repeating an operation without changing the result; re-index currently violates this for vectors. |
| **Shallow clone** | `--depth 1` clone without history; used for speed. |
| **Monorepo** | A repo containing many projects; stresses the current full-scan design. |
| **AST** | Abstract Syntax Tree; a real parser alternative to regex chunking/API discovery. |
| **CORS** | Browser cross-origin policy; fully open here. |
| **JWT** | Token-based auth; **not present**. |
| **Rate limiting** | Throttling requests; **not present**. |
| **Job queue / worker** | Durable background processing; **not present** (fire-and-forget promises). |
| **Mermaid** | Text-to-diagram syntax rendered in the browser. |
| **ChromaDB** | HTTP vector database used for chunk storage/retrieval. |
| **Ollama** | Local model server exposing `/api/embed` and `/api/chat`. |
| **`qwen2.5:3b`** | Default 3-billion-parameter chat model. |
| **`nomic-embed-text`** | Default embedding model. |
| **Prisma** | Type-safe ORM and migration tool. |
| **Express 5** | Node HTTP framework used for the API. |
| **Ant Design 6** | React component library used for the UI. |

---

## 21. Final 40-Question Assessment

Answer these without looking. The key follows.

### Basic (1–15)

1. What are the two AI models used by default, and what does each do?
2. Which database stores metadata, and which stores vectors?
3. What is the default backend port and frontend port?
4. Which file extensions are indexed?
5. What is `MAX_CHUNK_SIZE` and `CHUNK_OVERLAP`?
6. How many chunks go into a normal retrieval?
7. What makes a question "broad"?
8. How many messages of history are sent to the LLM?
9. What temperature is used for answers?
10. Where is the Chroma collection name defined?
11. What are the four Prisma models?
12. How is a repository URL validated?
13. What happens after `POST /api/repositories` returns 201?
14. How is an architecture diagram requested and rendered?
15. What does the Delete Repository flow remove?

### Advanced (16–30)

16. Explain the exact repository status state machine.
17. Why does an invalid URL return 500, and what is the correct code?
18. Describe the re-index stale-vector bug and two fixes.
19. Is this an agentic system? Justify.
20. How does broad retrieval select files, and why is that weak?
21. What is the embedding dimension and distance metric? Why is the answer careful?
22. How does the app avoid path traversal on file reads and deletes? Any gap?
23. What are the database indexing/constraint problems?
24. Why is `Milestone.conversationId` problematic?
25. How does the rolling summary work, and what are its weaknesses?
26. What is the prompt-injection surface?
27. How would you add streaming?
28. How would you make indexing incremental?
29. What breaks if the backend is horizontally scaled?
30. Which parts are production-ready vs not?

### Scenario / Debug (31–40)

31. Repo stuck in `embedding` after a restart — steps?
32. Progress bar always 0 — why and fix?
33. Answers cite nonexistent files — diagnose and mitigate.
34. A 50k-file repo is too slow — list four optimizations.
35. Delete on Repositories page throws `message is not defined` — fix.
36. Dashboard "Last Indexed" is blank — why?
37. Indexing History URL/date blank — why?
38. Settings save does nothing — why?
39. A repo was deleted but vectors remain — why?
40. You switch embedding models and retrieval degrades — why and what procedure?

### Answer key

1. `qwen2.5:3b` for chat/answers/summaries/milestones; `nomic-embed-text` for embeddings.
2. PostgreSQL (Prisma) for metadata/conversations/milestones; ChromaDB (`repomind_chunks`) for vectors and chunk text.
3. Backend `5000`; frontend Vite `5173`.
4. `.js .jsx .ts .tsx .py .java .go .php .json .md .sql .yaml .yml .sh .bash`.
5. 1500 characters and 200 characters.
6. Five (`TOP_K = 5`), plus a metadata chunk.
7. A regex match on architecture/API/endpoint/route/entry point/"how does … work"/structure/flow/improve/missing/feature/recommend/analysis.
8. The last six messages.
9. `0.1`.
10. `backend/src/config/chroma.js` (`repomind_chunks`).
11. `Repository`, `Conversation`, `Milestone`, `Message`.
12. `parseGitHubUrl` requires host `github.com`/`www.github.com`, at least owner/repo, and safe characters; it rebuilds a clean URL.
13. The repo row exists in `pending`/`cloning`; clone, scan, chunk, embed and vector writes continue asynchronously; the UI polls status every 2 s.
14. Architecture-keyword regex appends `ARCHITECTURE_PROMPT`; the model returns a fenced mermaid block; backend regex-extracts and sanitises it; the frontend renders it with Mermaid strict mode.
15. Chroma vectors (best-effort), messages, conversations, milestones, repository row (transaction), then the clone directory.
16. `pending → cloning → scanning → chunking → embedding → completed`; any failure → `failed` with `errorMessage`/`currentStage`.
17. `validateGitHubUrl` throws a plain `Error` with no `status`; middleware defaults to 500. It should be 400.
18. IDs are `repoId:index`; `add()` does not overwrite existing IDs (verified); old/higher-index vectors are never deleted. Fix with delete-then-add or `upsert` (ideally staged collection swap).
19. No. No tools, planning, or autonomous actions. Only regex-based conditional retrieval and memory.
20. `files.slice(0,40)` in walk order, each truncated to 1500 chars, deduped by path, capped at 15 total. `scoreFile` exists but is unused, so relevance is ignored.
21. **Unknown** from the repo. The model determines dimension and Chroma defaults determine the metric; the code declares neither. Verify via collection config rather than guessing.
22. `safeJoin` resolves and requires the base plus separator — solid. Delete uses `startsWith(storageRoot)` without a separator, so a sibling path with the same prefix could pass; tighten it. Git uses `shell:false`.
23. No indexes on FKs/sort columns, no unique `githubUrl`, free-form status/role strings, JSON blobs not queryable.
24. It is a plain optional string with no FK/relation, so deletes leave dangling IDs and you cannot include/cascade the conversation.
25. After each answer, if messages ≥8 and divisible by 4, the whole conversation is summarised and the single `summary` field is overwritten. Lossy, drift-prone, extra LLM cost, race-prone.
26. Retrieved repository text is injected into the user message unescaped; a repo can contain instructions the model may follow. No tools/secrets limit impact, but it is real.
27. Switch Ollama to `stream:true`, add an SSE endpoint that forwards deltas, update the React message incrementally, and send a final event with sources/diagram.
28. Store per-file/per-chunk content hashes, diff the tree, delete chunks for changed/removed files, embed only new/changed chunks, and update counts; optionally use `git fetch` + diff.
29. Fire-and-forget indexing has no shared coordination; local clone storage is per-instance; a poll can hit a different instance. Needs a queue + shared/object storage + idempotent workers.
30. Ready-ish: URL parsing, shallow clone, file safety, core RAG vertical slice, cascade delete. Not ready: auth, rate limits, durable jobs, progress, re-index correctness, indexes/constraints, observability, CI, tests, streaming.
31. Check status/error/stage, backend logs, Ollama model presence/health, Chroma heartbeat; re-index if stuck. Durable fix: persisted job recovery.
32. The status API has no `progress`/`indexingProgress`; the UI defaults to 0. Compute from `indexedFiles/totalFiles` or add a server field.
33. Compare `sources` (real retrieval metadata) with prose citations; if prose paths are fake, the model hallucinated. Validate citations against retrieved paths and instruct copying from `File:` headers.
34. Single-pass scanning, stream chunks instead of holding all, bounded parallel embeddings, better ignore rules/size caps, cache a manifest for broad questions.
35. Import `message` from `antd` in `Repositories.jsx` (it is used at lines 149/152 but missing from the import list).
36. The table column uses `dataIndex:'lastIndexedAt'`, but the API returns `updatedAt`; the stat card computes a fallback, the column does not.
37. The page reads `url` and `lastIndexedAt`; the API returns `githubUrl` and `updatedAt`.
38. `Settings.jsx` only shows a success toast in a `setTimeout`; nothing is persisted or applied.
39. Vector deletion is best-effort inside `try/catch` before the DB transaction; a Chroma failure leaves orphans. Add reconciliation/retries.
40. Old vectors survive because `add()` ignores existing IDs; dimensions may also differ. Delete all repo vectors/collection, re-index with the new model, and record model/version metadata.

---

## 22. What I Must Know Before Attending the Interview

1. **The one-liner:** a local RAG assistant that clones a public GitHub repo, embeds code chunks, and answers with file/line references.
2. **Exact stack and versions:** React 19.3 / Vite 8.3 / AntD 6.7 / Express 5.3 / Prisma 5.22 / Chroma 3.5 / Ollama.
3. **Defaults:** `qwen2.5:3b`, `nomic-embed-text`, ports 5000/5173/8000/5432, collection `repomind_chunks`.
4. **The pipeline order:** clone → scan → language/stack → chunk (1500/200) → embed (batch 20) → Chroma `add` → retrieve top-5 → prompt → answer.
5. **Broad-question rule:** the exact regex, top-10 vectors, first 40 files ×1500 chars, cap 15.
6. **Prompt settings:** temp 0.1, last 6 messages, `stream:false`, 2 retries, 300 s timeout.
7. **The re-index bug:** deterministic IDs + non-overwriting `add()` + no delete = stale vectors (verified).
8. **The invalid-URL bug:** plain `Error` → 500 instead of 400, and a test encodes it.
9. **No agent:** deterministic routing + memory, not tool calling or planning.
10. **Memory design:** rolling `Conversation.summary` (≥8 msgs, %4) + top-3 keyword-scored milestones.
11. **Data model:** four Prisma models; no indexes/uniques; `Milestone.conversationId` has no FK.
12. **API surface:** list the main endpoints and know that conversation handlers are duplicated under `/chat` and `/conversations`.
13. **Security posture:** no auth/rate limits, open CORS, prompt-injection surface; good path/git safety and Mermaid strict mode.
14. **Frontend bugs to admit:** missing `message` import, blank `lastIndexedAt`/`url`, fake Settings, unrouted `ChatAssistant`, fake progress.
15. **Tests:** 2 suites / 5 tests only; no RAG/DB/UI coverage; build is 1.67 MB with a chunk-size warning.
16. **Infra:** Docker Compose only for Postgres + Chroma; no Dockerfile, no CI, host-run Node/Ollama.
17. **Performance story:** LLM dominates chat; broad questions rescan the repo; all chunks are held in memory; no caching.
18. **Honest maturity:** working local prototype, not multi-user production software.
19. **Top fixes to propose:** delete-then-upsert re-index, streaming, cached repo scan, DB indexes/uniques, auth + queue.
20. **Never claim:** GPU acceleration, LangChain, streaming, vector overwrite, full test coverage, authentication, or a deployment pipeline — none are implemented.
