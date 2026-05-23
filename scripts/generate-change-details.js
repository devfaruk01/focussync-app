#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr) : '';
    const stdout = error.stdout ? String(error.stdout) : '';
    const msg = (stderr || stdout || error.message || '').trim();
    throw new Error(msg || `Command failed: ${cmd}`);
  }
}

function parseStatus() {
  const raw = run('git status --porcelain=v1');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      file: line.slice(3).trim()
    }));
}

function parseDiffForFile(file) {
  const escaped = file.replace(/"/g, '\\"');
  let diff = '';
  try {
    diff = run(`git diff --no-color --unified=0 -- \"${escaped}\"`);
  } catch {
    return [];
  }

  const lines = diff.split('\n');
  const hunks = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!m) continue;

      oldLine = Number(m[1]);
      newLine = Number(m[3]);

      current = {
        header: line,
        oldRange: { start: Number(m[1]), count: Number(m[2] || 1) },
        newRange: { start: Number(m[3]), count: Number(m[4] || 1) },
        removed: [],
        added: []
      };

      hunks.push(current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    if (line.startsWith('-')) {
      current.removed.push({ line: oldLine, code: line.slice(1) });
      oldLine += 1;
      continue;
    }

    if (line.startsWith('+')) {
      current.added.push({ line: newLine, code: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }

  return hunks;
}

function readCurrentFile(file) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) return [];
  const content = fs.readFileSync(abs, 'utf8');
  return content.split('\n').map((code, idx) => ({ line: idx + 1, code }));
}

const reasonMap = {
  'backend/config/database.js': 'Backend database layer empty chilo, minimal connect/status scaffold add kora hoyeche.',
  'backend/middleware/auth.js': 'Auth middleware empty chilo, bearer token parse + request user binding add kora hoyeche.',
  'backend/middleware/rateLimit.js': 'Rate-limit middleware empty chilo, in-memory throttle logic add kora hoyeche.',
  'backend/models/Blocklist.js': 'Blocklist model empty chilo, user-wise blocklist store/get add kora hoyeche.',
  'backend/models/Session.js': 'Session model empty chilo, session create/list/overview logic add kora hoyeche.',
  'backend/models/User.js': 'User model empty chilo, register/find/safe profile logic add kora hoyeche.',
  'backend/package.json': 'Invalid empty package.json fix kore valid backend config + dependencies add kora hoyeche.',
  'backend/routes/auth.js': 'Auth routes empty chilo, register/login/me endpoints add kora hoyeche.',
  'backend/routes/stats.js': 'Stats route empty chilo, overview endpoint add kora hoyeche.',
  'backend/routes/sync.js': 'Sync route empty chilo, state/session/blocklist endpoints add kora hoyeche.',
  'backend/server.js': 'Backend server file empty chilo, express app bootstrap + routes mount add kora hoyeche.',
  'desktop/electron/main.js': 'Electron main process empty chilo, BrowserWindow lifecycle + loadFile logic add kora hoyeche.',
  'desktop/electron/package.json': 'Start script update kora hoyeche env conflict fix + runtime compatibility-r jonno.',
  'desktop/electron/preload.js': 'Preload bridge refine kora hoyeche app metadata safely expose korte.',
  'desktop/services/FocusLock.js': 'File-e invalid markdown/code block chilo, valid service implementation e replace kora hoyeche.',
  'desktop/services/HostsManager.js': 'Empty file fill kore hosts blocker wrapper service add kora hoyeche.',
  'desktop/services/ProcessManager.js': 'Empty file fill kore minimal process manager add kora hoyeche.',
  'desktop/services/SyncService.js': 'Empty file fill kore event-based sync service add kora hoyeche.',
  'desktop/src/modules/hostsBlocker.js': 'Duplicate class/exports syntax issue chilo, single valid blocker implementation e clean kora hoyeche.',
  'desktop/src/renderer/app.js': 'Renderer file-e mixed module syntax + DOM mismatch chilo, pure browser-compatible app controller rewrite kora hoyeche.',
  'desktop/src/renderer/components/Dashboard.js': 'Empty file fill kore dashboard component helper add kora hoyeche.',
  'desktop/src/renderer/components/FocusMode.js': 'Invalid React-style code replace kore plain renderer helper add kora hoyeche.',
  'desktop/src/renderer/components/Settings.js': 'Empty file fill kore settings helper add kora hoyeche.',
  'desktop/src/renderer/components/Stats.js': 'Empty file fill kore stats helper add kora hoyeche.',
  'CHANGE_MAP.md': 'Auto-generated change map report file create kora hoyeche.',
  'backend/package-lock.json': 'npm install er por backend dependency lockfile auto-generate hoyeche.',
  'desktop/electron/package-lock.json': 'electron dependency update/install er por lockfile auto-generate hoyeche.',
  'desktop/src/modules/timerManager.js': 'Untracked existing file; ei run-e direct edit kora hoyni.',
  'desktop/src/renderer/components/main.js': 'Untracked existing file; ei run-e direct edit kora hoyni.',
  'scripts/generate-change-map.js': 'Change map generate korar jonno node utility script add kora hoyeche.',
  'CHANGE_MAP.json': 'Auto-generated JSON change map report file create kora hoyeche.',
  'scripts/generate-change-details.js': 'Per-file change cause + old/new code report generate korar jonno utility add kora hoyeche.'
};

function inferReason(file, status) {
  if (reasonMap[file]) return reasonMap[file];
  if (status === '??') return 'New/untracked file. Old code chilo na.';
  return 'Tracked file change detect hoyeche (git diff onujayi).';
}

function formatCodeBlock(lines) {
  if (!lines.length) return '(none)';
  return lines.map((l) => `${l.line}: ${l.code}`).join('\n');
}

function buildMarkdown() {
  const entries = parseStatus();

  const out = [];
  out.push('# Change Details (File-wise)');
  out.push('');
  out.push(`Generated at: ${new Date().toISOString()}`);
  out.push(`Repository: ${process.cwd()}`);
  out.push(`Total files: ${entries.length}`);
  out.push('');

  entries.forEach((entry) => {
    const { file, status } = entry;
    out.push(`## ${file}`);
    out.push(`- Git Status: \`${status}\``);
    out.push(`- Change Cause: ${inferReason(file, status)}`);
    out.push('');

    if (status === '??') {
      const newLines = readCurrentFile(file);
      out.push('### Old Code');
      out.push('```txt');
      out.push('(none - new/untracked file)');
      out.push('```');
      out.push('');
      out.push('### New Code');
      out.push('```txt');
      out.push(formatCodeBlock(newLines));
      out.push('```');
      out.push('');
      return;
    }

    const hunks = parseDiffForFile(file);

    if (!hunks.length) {
      out.push('### Old Code');
      out.push('```txt');
      out.push('(no removed lines in current diff)');
      out.push('```');
      out.push('');
      out.push('### New Code');
      out.push('```txt');
      out.push('(no added lines in current diff)');
      out.push('```');
      out.push('');
      return;
    }

    hunks.forEach((hunk, idx) => {
      out.push(`### Hunk ${idx + 1}`);
      out.push(`- Header: \`${hunk.header}\``);
      out.push(`- Old Range: start ${hunk.oldRange.start}, count ${hunk.oldRange.count}`);
      out.push(`- New Range: start ${hunk.newRange.start}, count ${hunk.newRange.count}`);
      out.push('');

      out.push('Old Code:');
      out.push('```txt');
      out.push(formatCodeBlock(hunk.removed));
      out.push('```');
      out.push('');

      out.push('Changed/New Code:');
      out.push('```txt');
      out.push(formatCodeBlock(hunk.added));
      out.push('```');
      out.push('');
    });
  });

  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outFile = outIndex !== -1 && args[outIndex + 1]
    ? args[outIndex + 1]
    : 'CHANGE_DETAILS.md';

  const markdown = buildMarkdown();
  const outPath = path.resolve(process.cwd(), outFile);
  fs.writeFileSync(outPath, markdown, 'utf8');
  console.log(`Change details saved: ${outPath}`);
}

main();
