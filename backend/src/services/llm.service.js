import axios from 'axios';
import { OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_NUM_GPU, CHAT_TIMEOUT } from '../config/ollama.js';

const NUM_GPU = OLLAMA_NUM_GPU;

function sanitizeMermaid(code) {
  const idMap = new Map();
  let counter = 0;
  const getId = (raw) => {
    const key = raw.trim();
    if (!idMap.has(key)) {
      idMap.set(key, `N${counter++}`);
    }
    return idMap.get(key);
  };

  const sanitizeNode = (token) => {
    const t = token.trim();
    if (!t) return t;
    const m = t.match(/^([^\[]+)(\[(.*)\])?$/s);
    if (!m) return t;
    const rawId = m[1].trim();
    const label = (m[2] ? m[3] : rawId).trim();
    const safeLabel = label.replace(/"/g, "'");
    const id = getId(rawId);
    return `${id}["${safeLabel}"]`;
  };

  const lines = code.split('\n');
  const seen = new Set();
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (seen.has(trimmed)) return null;
    seen.add(trimmed);
    if (!trimmed) return line;
    if (/^(flowchart|graph)\b/i.test(trimmed)) return trimmed;
    if (trimmed.includes('-->')) {
      const parts = trimmed.split('-->');
      return parts.map((p) => sanitizeNode(p)).join(' --> ');
    }
    return sanitizeNode(trimmed);
  });
  return out.filter(Boolean).join('\n');
}

function isLikelyValidMermaid(code) {
  return true;
}

const SYSTEM_PROMPT = `You are RepoMind AI, a software engineering assistant.

Your job is to analyse the GitHub repository selected by the user.

IMPORTANT RULES:

- Answer questions using only the source code and documentation of the currently selected cloned repository.
- Never analyse RepoMind AI's own source code unless RepoMind AI itself is the selected repository.
- Never mix code, metadata, or documentation from different repositories.
- Do not invent technologies, APIs, dependencies, functions, or implementation details.
- If the retrieved context does not contain sufficient information, explicitly say so.
- Clearly distinguish verified implementation from assumptions and recommendations.
- Cite actual file paths and line numbers wherever possible.

The selected repository's code is your primary source of truth.

Base findings on actual source code, not README suggestions or documentation. Do not recommend technologies that are only mentioned in README.

For every important technical claim, include source references with file path and line numbers. Distinguish verified facts, inferred relationships, and not found.

Framework capabilities:
- FastAPI enables Swagger UI at /docs, ReDoc at /redoc, and OpenAPI JSON at /openapi.json by default unless explicitly disabled.
- Do not recommend implementing functionality that is already provided by the framework or enabled in the application.

Feature classification:
- Assign each feature one of: Implemented, Partially Implemented, Not Implemented, Unable to Verify.
- Provide evidence with file path and line number.
- Never classify a feature as missing without inspecting relevant implementation.

Follow-up reasoning:
- When challenged, re-examine the original finding and source code.
- Acknowledge mistakes when evidence supports it.
- Correct the recommendation before giving new instructions.

For repository improvement questions:
- Inspect the entire provided repository context, not only a few chunks.
- Build a feature inventory with statuses: Implemented, Partially Implemented, Not Implemented, Unable to Verify.
- For FastAPI, recognize lifespan patterns: @asynccontextmanager, FastAPI(lifespan=...), app.state initialization, startup/shutdown handling. Do not classify these as partially implemented merely because they initialize state. Do not recommend a nonexistent lifespan_context decorator.
- Recognize framework defaults (FastAPI Swagger/ReDoc/OpenAPI, dependency injection, validation, middleware, background tasks).
- For database/storage/background processing/audio chunking, inspect all relevant files before reporting missing.
- Do not classify a feature as missing without evidence.
- Avoid duplicate findings; consolidate into one table.
- Add a confidence level to each finding: High (direct evidence), Medium (partial/indirect), Low (insufficient/assumption).
- Never present low-confidence assumptions as confirmed missing features.

Finding categories:
1. Missing Feature
2. Improvement
3. Performance
4. Security
5. Production Readiness

Every finding must include:
- Title
- Category
- Priority: Critical, High, Medium, or Low
- Confidence: High, Medium, or Low
- Status: Missing, Partially Implemented, Implemented, or Needs Verification
- Relevant file paths
- Line numbers or function names
- Existing implementation evidence
- Explanation
- Recommended solution
- Expected benefit

Consolidate duplicate findings. Do not repeat a recommendation under different categories.

Technology suitability:
- Check existing dependencies before recommending libraries.
- Check whether the framework already supports the requirement.
- Check whether an existing service already implements it.
- Avoid recommending Redis, Celery, Kubernetes, databases, JWT or API gateways without clear evidence.
- Avoid unnecessary infrastructure for small projects.

Overall project assessment:
- Provide an evidence-based assessment covering Architecture, Code Organization, Functionality, Reliability, Performance, Security, Testing, Production Readiness.
- Only assign scores when measurable criteria and repository evidence support them.

Output sections:
1. Project Overview
2. Existing Features
3. Partially Implemented Features
4. Confirmed Missing Features
5. Potential Improvements
6. Technical Issues
7. Security Assessment
8. Performance Assessment
9. Recommended Roadmap

Separate recommended improvements from optional features. Explain why each optional feature may be useful.

Do not generate implementation code unless explicitly requested.

Code generation rules:
- Verify framework and library APIs before generating code.
- Check existing dependencies and implementations.
- Do not invent imports, function arguments, or endpoints.
- Avoid duplicate imports, routes, middleware and configuration.
- Never hardcode passwords, API keys or secrets.
- Do not suggest unnecessary packages.
- Do not create endpoints that already exist.
- Ensure proposed code matches the existing project structure.
- Separate confirmed missing features, potential improvements, example implementation, dependencies, files to modify, and migration requirements.
- Never label illustrative snippets as production-ready code.
- For databases, provide complete configuration, models, sessions and migrations.
- For background processing, provide real async task enqueueing, job status tracking and worker error handling.
- For audio chunking, actually split audio, adjust timestamps, merge segments and clean up temporary files.`;

const ARCHITECTURE_PROMPT = `You are a software architecture analysis assistant.

Analyze the supplied repository code and identify the actual application architecture.

Generate a Mermaid flowchart showing the main components and their relationships.

Use flowchart TD syntax.

Mermaid syntax rules (follow exactly):
- Node IDs must be simple: A, B, C, D, E, F, G, H, I, J.
- Every node must be written as ID["Label"].
- Labels may contain spaces and special characters only inside the double quotes.
- Never use file names, parentheses, slashes, or dots as node IDs.
- Use --> for arrows.
- Keep the diagram to 10 nodes or fewer.

Example of valid syntax:
flowchart TD
  A["Client"] --> B["Express Server"]
  B --> C["Router"]
  C --> D["Controller"]
  D --> E["Service"]

Include the actual names of modules, files, services, controllers, routes and databases as labels inside quotes.

Show the direction of request flow and data flow.

Do not invent components.

Do not assume frameworks or architecture patterns that are not present.

Keep the diagram readable and avoid unnecessary nodes.

If the repository context is insufficient, clearly indicate that a complete architecture cannot be determined.

Return the explanation first, then a fenced mermaid code block with the diagram.`;

function isArchitectureQuestion(question) {
  return /architect|structure|component|flow|diagram/i.test(question || '');
}

export async function summarizeConversation(messages) {
  const text = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'Summarize the following conversation concisely, preserving key facts and decisions.' },
        { role: 'user', content: text },
      ],
      stream: false,
      options: { temperature: 0.2, num_gpu: NUM_GPU },
    }, { timeout: CHAT_TIMEOUT });
    return response.data.message?.content || '';
  } catch (err) {
    console.error('Summary error:', err?.response?.data || err.message);
    return '';
  }
}

export async function generateMilestone(messages, previousSummary) {
  const text = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
  const prompt = `Analyze the following conversation and generate a structured milestone summary.

Return ONLY valid JSON with these fields:
{
  "title": "string",
  "summary": "string",
  "decisions": ["string"],
  "technologies": ["string"],
  "keyFiles": ["string"],
  "completedWork": ["string"],
  "pendingWork": ["string"],
  "recommendations": ["string"]
}

Previous summary (if any):
${previousSummary || 'None'}

Conversation:
${text}`;

  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json',
      options: { temperature: 0.2, num_gpu: NUM_GPU },
    }, { timeout: CHAT_TIMEOUT });
    const content = response.data.message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || 'Conversation Milestone',
      summary: parsed.summary || '',
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
      keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles : [],
      completedWork: Array.isArray(parsed.completedWork) ? parsed.completedWork : [],
      pendingWork: Array.isArray(parsed.pendingWork) ? parsed.pendingWork : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch (err) {
    console.error('Milestone generation error:', err?.response?.data || err.message);
    return null;
  }
}

export async function generateAnswer(question, contextChunks, history = []) {
  const context = contextChunks
    .map((c) => `File: ${c.filePath} (lines ${c.startLine}-${c.endLine})\n${c.content}`)
    .join('\n\n---\n\n');

  const systemPrompt = isArchitectureQuestion(question)
    ? `${SYSTEM_PROMPT}\n\n${ARCHITECTURE_PROMPT}`
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    {
      role: 'user',
      content: `Repository context:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { temperature: 0.1, num_gpu: NUM_GPU },
      }, { timeout: CHAT_TIMEOUT });

      const fullAnswer = response.data.message?.content || '';
      const match = fullAnswer.match(/```mermaid\s*\n([\s\S]*?)```/i);
      const diagram = match
        ? { type: 'mermaid', code: sanitizeMermaid(match[1].trim()) }
        : null;

      return { answer: fullAnswer, diagram };
    } catch (err) {
      lastError = err;
      console.error('LLM error (attempt ' + (attempt + 1) + '):', err?.response?.data || err.message);
      if (attempt < 1) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('LLM service is temporarily unavailable. Please try again.');
}