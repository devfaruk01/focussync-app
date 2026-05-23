#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const message = error.stderr ? String(error.stderr) : error.message;
    throw new Error(message.trim() || `Command failed: ${cmd}`);
  }
}

function parseStatus() {
  const raw = run('git status --porcelain=v1');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const file = line.slice(3).trim();
      return { status, file };
    });
}

function parseDiff() {
  const diff = run('git diff --no-color --unified=0 --find-renames=0');
  const lines = diff.split('\n');

  const files = [];
  let currentFile = null;
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const filePath = match ? match[2] : line;

      currentFile = {
        file: filePath,
        hunks: []
      };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith('@@ ')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        continue;
      }

      const oldStart = Number(match[1]);
      const oldCount = Number(match[2] || 1);
      const newStart = Number(match[3]);
      const newCount = Number(match[4] || 1);

      currentHunk = {
        location: line,
        oldRange: { start: oldStart, count: oldCount },
        newRange: { start: newStart, count: newCount },
        removed: [],
        added: []
      };

      currentFile.hunks.push(currentHunk);
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    if (line.startsWith('-')) {
      currentHunk.removed.push({
        line: oldLine,
        code: line.slice(1)
      });
      oldLine += 1;
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.added.push({
        line: newLine,
        code: line.slice(1)
      });
      newLine += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return files;
}

function buildReport() {
  const status = parseStatus();
  const diffFiles = parseDiff();

  const diffByFile = new Map(diffFiles.map((entry) => [entry.file, entry]));

  const files = status.map(({ status: fileStatus, file }) => {
    const diff = diffByFile.get(file);

    if (!diff) {
      return {
        file,
        gitStatus: fileStatus,
        note: 'No hunk diff (likely untracked/new file).',
        hunks: []
      };
    }

    return {
      file,
      gitStatus: fileStatus,
      hunks: diff.hunks
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    totalFiles: files.length,
    files
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Change Map');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Repo: \`${report.cwd}\``);
  lines.push(`- Changed files: ${report.totalFiles}`);
  lines.push('');

  for (const fileEntry of report.files) {
    lines.push(`## ${fileEntry.file}`);
    lines.push(`- Status: \`${fileEntry.gitStatus}\``);

    if (fileEntry.note) {
      lines.push(`- Note: ${fileEntry.note}`);
      lines.push('');
      continue;
    }

    if (!fileEntry.hunks.length) {
      lines.push('- No hunk details available.');
      lines.push('');
      continue;
    }

    fileEntry.hunks.forEach((hunk, index) => {
      lines.push(`### Hunk ${index + 1}`);
      lines.push(`- Header: \`${hunk.location}\``);
      lines.push(`- Old range: start ${hunk.oldRange.start}, count ${hunk.oldRange.count}`);
      lines.push(`- New range: start ${hunk.newRange.start}, count ${hunk.newRange.count}`);
      lines.push('');

      lines.push('Removed code:');
      lines.push('```txt');
      if (!hunk.removed.length) {
        lines.push('(none)');
      } else {
        hunk.removed.forEach((item) => {
          lines.push(`${item.line}: ${item.code}`);
        });
      }
      lines.push('```');
      lines.push('');

      lines.push('Added code:');
      lines.push('```txt');
      if (!hunk.added.length) {
        lines.push('(none)');
      } else {
        hunk.added.forEach((item) => {
          lines.push(`${item.line}: ${item.code}`);
        });
      }
      lines.push('```');
      lines.push('');
    });
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const outIndex = args.indexOf('--out');
  const outPath = outIndex !== -1 && args[outIndex + 1]
    ? args[outIndex + 1]
    : 'CHANGE_MAP.md';

  const report = buildReport();
  const absoluteOutPath = path.resolve(process.cwd(), outPath);

  if (outputJson) {
    fs.writeFileSync(absoluteOutPath, JSON.stringify(report, null, 2), 'utf8');
  } else {
    fs.writeFileSync(absoluteOutPath, renderMarkdown(report), 'utf8');
  }

  console.log(`Change map saved: ${absoluteOutPath}`);
}

main();
