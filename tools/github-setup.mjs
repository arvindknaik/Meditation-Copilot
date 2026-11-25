#!/usr/bin/env node
/* One-time GitHub set-up with the GitHub CLI (https://cli.github.com, then `gh auth login`):
 * labels, milestones, and the backlog in docs/backlog.json as Epic issues with Feature sub-issues.
 *   node tools/github-setup.mjs            (safe to run again: skips what already exists) */
import { run, readJSON } from './lib.mjs';

const gh = (args, input) => run('gh', args, { capture: true, allowFail: true, input });
const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
if (!repo) { console.error('GitHub CLI not ready. Install it from https://cli.github.com and run: gh auth login'); process.exit(1); }
console.log('Repository:', repo);
for (const l of readJSON('.github/labels.json')) gh(['label', 'create', l.name, '--color', l.color, '--description', l.description, '--force']);
console.log('✓ labels');
const B = readJSON('docs/backlog.json');
const existingMs = JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`]) || '[]').map((m) => m.title);
for (const m of B.milestones) if (!existingMs.includes(m.title)) gh(['api', `repos/${repo}/milestones`, '-f', `title=${m.title}`, '-f', `description=${m.description}`]);
console.log('✓ milestones');
const existing = JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title']) || '[]');
const find = (t) => existing.find((i) => i.title === t);
function issue(title, body, labels, milestone, closed) {
  let it = find(title);
  if (!it) {
    const url = gh(['issue', 'create', '--title', title, '--body', body, ...labels.flatMap((l) => ['--label', l]), ...(milestone ? ['--milestone', milestone] : [])]);
    const number = Number(String(url).split('/').pop()); it = { number, title }; existing.push(it);
    if (closed) gh(['issue', 'close', String(number), '--reason', 'completed', '--comment', 'Built before the new process; ships in v0.19.']);
    console.log(`  #${number} ${title}`);
  }
  return it;
}
for (const e of B.epics) {
  const ep = issue(e.title, `**Goal:** ${e.goal}\n\n**Spec:** ${e.spec}`, ['epic'], e.milestone);
  for (const f of e.features) {
    const fi = issue(f.title, `Part of #${ep.number} (${e.title}).`, ['feature', ...f.labels], f.milestone, f.done);
    const id = gh(['api', `repos/${repo}/issues/${fi.number}`, '-q', '.id']);
    gh(['api', '-X', 'POST', `repos/${repo}/issues/${ep.number}/sub_issues`, '-F', `sub_issue_id=${id}`]);   // already linked: ignored
  }
}
console.log('✓ backlog: epics with their features as sub-issues');
