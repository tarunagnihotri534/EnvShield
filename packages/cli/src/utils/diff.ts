/**
 * Unified diff parser.
 *
 * Extracts added lines (lines beginning with '+' but not '+++') from a unified
 * diff, along with their filename and reconstructed line number in the new file.
 * This is what we feed to scanContent() during `envshield scan`.
 */

export interface DiffLine {
  /** Path of the file this line belongs to (new-file path from the diff header). */
  filename: string;
  /** 1-based line number in the new version of the file. */
  lineNumber: number;
  /** Raw text content of the line (the leading '+' is stripped). */
  content: string;
}

/**
 * Represents all added lines from a single file within the diff.
 */
export interface FileDiff {
  filename: string;
  /** Added lines grouped by hunk, in order. */
  lines: DiffLine[];
}

/**
 * Parses a unified diff string and returns the added lines per file.
 *
 * Only added lines ('+' prefix) are returned — we don't scan removed lines
 * because they represent content being deleted, not newly introduced secrets.
 *
 * Handles:
 *   - Standard `git diff` output (diff --git a/... b/...)
 *   - Binary files (skipped)
 *   - Renamed / copied files (uses the destination filename)
 *   - Multiple hunks per file
 */
export function parseDiff(diff: string): FileDiff[] {
  if (!diff.trim()) return [];

  const fileMap = new Map<string, FileDiff>();
  let currentFile: FileDiff | null = null;
  let newLineNumber = 0; // tracks current position in new file

  const lines = diff.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // ── New file header ────────────────────────────────────────────────────
    // "diff --git a/path b/path"
    if (line.startsWith('diff --git ')) {
      currentFile = null;
      newLineNumber = 0;
      continue;
    }

    // "+++ b/path" — canonical new-file path line
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      // Strip the "b/" prefix that git adds
      const filename = raw.startsWith('b/') ? raw.slice(2) : raw;

      if (filename === '/dev/null') {
        // File was deleted — skip
        currentFile = null;
      } else {
        if (!fileMap.has(filename)) {
          fileMap.set(filename, { filename, lines: [] });
        }
        currentFile = fileMap.get(filename)!;
      }
      continue;
    }

    // Skip everything until we have a target file
    if (currentFile === null) continue;

    // ── Hunk header ────────────────────────────────────────────────────────
    // "@@ -old_start,old_count +new_start,new_count @@"
    if (line.startsWith('@@ ')) {
      const m = /\+(\d+)(?:,\d+)?/.exec(line);
      if (m?.[1]) {
        newLineNumber = parseInt(m[1], 10);
        // The hunk header itself is not a content line; the first content line
        // will start at newLineNumber, so we set it and let the loop handle it.
      }
      continue;
    }

    // ── Content lines ──────────────────────────────────────────────────────
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // Added line
      currentFile.lines.push({
        filename: currentFile.filename,
        lineNumber: newLineNumber,
        content: line.slice(1), // strip the leading '+'
      });
      newLineNumber++;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line — does not advance new-file counter
      continue;
    }

    if (!line.startsWith('\\')) {
      // Context line (or blank) — advance counter
      newLineNumber++;
    }
    // Lines starting with '\' are "\ No newline at end of file" markers — skip
  }

  return Array.from(fileMap.values()).filter((f) => f.lines.length > 0);
}

/**
 * Flattens all added lines from a FileDiff[] into a single DiffLine[],
 * ordered by filename then line number.
 */
export function flattenDiffLines(fileDiffs: FileDiff[]): DiffLine[] {
  return fileDiffs.flatMap((f) => f.lines);
}

/**
 * Groups DiffLine[] by filename, returning a Map<filename, DiffLine[]>.
 * Useful for feeding each file's lines to scanContent() separately.
 */
export function groupByFile(lines: DiffLine[]): Map<string, DiffLine[]> {
  const map = new Map<string, DiffLine[]>();
  for (const line of lines) {
    const existing = map.get(line.filename);
    if (existing) {
      existing.push(line);
    } else {
      map.set(line.filename, [line]);
    }
  }
  return map;
}
