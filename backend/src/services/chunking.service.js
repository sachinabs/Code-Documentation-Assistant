const MAX_CHUNK_SIZE = parseInt(process.env.MAX_CHUNK_SIZE || '1500', 10);
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '200', 10);

const BOUNDARY_REGEX = /^\s*(export\s+)?(async\s+)?(function|class|const|let|var)\s+\w+|^\s*(def|class)\s+\w+|^\s*(public|private|protected)?\s*(static\s+)?(void|int|string|bool|func)\s+\w+\s*\(/;

function overlapLines(lines) {
  const result = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    size += lines[i].length + 1;
    result.unshift(lines[i]);
    if (size >= CHUNK_OVERLAP) break;
  }
  return result;
}

export function chunkCode(content, filePath, language) {
  const lines = content.split('\n');
  const chunks = [];
  let current = [];
  let currentSize = 0;
  let startLine = 1;

  const finalize = (endLine) => {
    if (current.length === 0) return;
    const text = current.join('\n').trim();
    if (text.length > 0) {
      chunks.push({
        filePath,
        language,
        startLine,
        endLine,
        content: text,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBoundary = i > 0 && BOUNDARY_REGEX.test(line);

    if (isBoundary && currentSize > MAX_CHUNK_SIZE / 3) {
      finalize(i); // endLine is i (1-based? adjust)
      const ov = overlapLines(current);
      current = [...ov, line];
      currentSize = current.reduce((s, l) => s + l.length + 1, 0);
      startLine = i + 1 - ov.length;
      continue;
    }

    current.push(line);
    currentSize += line.length + 1;

    if (currentSize >= MAX_CHUNK_SIZE) {
      finalize(i + 1);
      const ov = overlapLines(current);
      current = [...ov];
      currentSize = current.reduce((s, l) => s + l.length + 1, 0);
      startLine = i + 2 - ov.length;
    }
  }
  finalize(lines.length);
  // fix startLine for last chunk if needed
  return chunks.map((c, idx) => ({
    ...c,
    startLine: c.startLine < 1 ? 1 : c.startLine,
    endLine: c.endLine < c.startLine ? c.startLine : c.endLine,
  }));
}