# RepoMind AI

RepoMind AI is a local code documentation assistant. You give it a public GitHub repository URL. The application clones the repository, analyzes the source code, indexes it using embeddings, and lets you ask questions about the codebase through a chat interface.

Answers include source file references and line numbers.

## Main features

- Clone a public GitHub repository from a URL.
- Scan and index supported source files.
- Detect programming languages and technology stack.
- Explore repository files in a tree view.
- Discover API endpoints from source code.
- Generate an architecture diagram from repository evidence.
- Chat with the codebase using a local Ollama model.
- Create and manage multiple conversations per repository.
- Save conversation milestones for future context.
- Re-index or delete repositories.
- View indexing history.

## Technology stack

### Frontend
- React 19
- Vite
- Ant Design 6
- React Router 7
- Axios
- Mermaid.js
- react-markdown, remark-gfm, rehype-highlight

### Backend
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- ChromaDB
- Ollama
- simple-git
- Axios

### AI
- Ollama for LLM inference
- Default LLM: qwen2.5:3b
- Default embedding model: nomic-embed-text
- ChromaDB for vector storage

## Architecture overview

```mermaid
flowchart TD
    User[User] --> Frontend[React Frontend]
    Frontend --> Backend[Express.js Backend]
    Backend --> Clone[Repository Cloning]
    Clone --> Scan[Source Code Processing]
    Scan --> Chunk[Code Chunking]
    Chunk --> Embed[Embedding Generation]
    Embed --> Vector[ChromaDB Vector Storage]
    Vector --> Retrieve[Semantic Retrieval]
    Retrieve --> Ollama[Ollama LLM]
    Ollama --> Response[Answer with Source References]
    Response --> Frontend
    Backend --> DB[PostgreSQL]
    DB --> Conversations[Conversations and Messages]
    DB --> Milestones[Milestones]
```

## Project structure

```text
Repo Mind - AI/
  frontend/          React + Vite frontend
  backend/           Express.js backend
  README.md          This file
```

Important backend folders:

```text
backend/src/
  config/            Database, Ollama and Chroma configuration
  controllers/       HTTP request handlers
  routes/            Express route definitions
  services/          Business logic and RAG pipeline
  middleware/        Error handling
  utils/             Git and file utilities
```

Important frontend folders:

```text
frontend/src/
  components/        Reusable React components
  pages/             Application pages
  layouts/           Main dashboard layout
  services/          Axios API service
  utils/             Validators and file tree helpers
  styles/            Global CSS
```

## Installation and startup

### 1. Clone the project

```bash
git clone <repository-url>
cd "Repo Mind - AI"
```

### 2. Start infrastructure

PostgreSQL and ChromaDB are provided through Docker Compose.

```bash
cd backend
docker compose up -d
```

### 3. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` if needed. The defaults work for local development.

### 4. Install Ollama and models

Install Ollama from https://ollama.com.

Download the required models:

```bash
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

Make sure Ollama is running on `http://localhost:11434`.

### 5. Install backend dependencies and set up the database

```bash
cd backend
npm install
npx prisma migrate dev
```

### 6. Start the backend

```bash
cd backend
npm run dev
```

The backend runs on `http://localhost:5000`.

### 7. Install frontend dependencies and start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

### 8. Open the application

Open `http://localhost:5173` in your browser.

## Configuration

Backend environment variables:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/repomind
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
CHROMA_URL=http://localhost:8000
REPOSITORY_STORAGE_PATH=./storage/repositories
MAX_FILE_SIZE_BYTES=200000
MAX_CHUNK_SIZE=1500
CHUNK_OVERLAP=200
```

## Application workflow

### Submitting a repository

1. The user enters a GitHub repository URL.
2. The backend validates the URL and clones the repository.
3. The backend scans supported source files.
4. It detects languages and technology stack.
5. It chunks the source code.
6. It generates embeddings using Ollama.
7. It stores vectors and metadata in ChromaDB.
8. Repository metadata is saved in PostgreSQL.

### Asking a question

1. The user selects a repository and conversation.
2. The question is sent to the backend.
3. Relevant code chunks are retrieved.
4. Conversation summary and milestones may be included.
5. The retrieved context is sent to Ollama.
6. Ollama generates an answer.
7. The backend returns the answer, source references and an optional architecture diagram.

## Future improvements

Possible improvements not yet implemented:

- Support private repositories.
- Better repository update and incremental indexing.
- More advanced code-aware chunking.
- Richer milestone editor.
- User authentication for multi-user usage.
- Deployment-ready background workers.
- More comprehensive automated tests.

## More documentation

- Frontend documentation: `frontend/README.md`
- Backend documentation: `backend/README.md`