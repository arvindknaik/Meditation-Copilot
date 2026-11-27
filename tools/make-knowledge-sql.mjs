// One-time generator for api/migrations/0012_knowledge.sql (v0.22): moves the Learn articles built into Copilot
// (apps/copilot/js/knowledge.js) into the Library, and adds the draft quizzes from content/quizzes.json.
// Run: node tools/make-knowledge-sql.mjs > /tmp/data.sql   (the migration file already contains its output)
import fs from 'node:fs';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url).pathname;
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(ROOT + 'apps/copilot/js/knowledge.js', 'utf8'), ctx);
const K = ctx.window.MC_KNOWLEDGE;
const q = (s) => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const TOPIC = { 'learn-to-meditate': 'basics', 'improve-meditation': 'basics', benefits: 'health', 'know-the-masters': 'masters', 'spiritual-goals': 'science',
  'spiritual-teachings': 'science', 'wandering-mind': 'basics', 'daily-habit': 'basics', 'meditation-space': 'basics', 'find-center': 'satsang', 'meditation-faq': 'basics', 'spiritual-quotes': 'masters' };
const out = [];
let pr = 10;
for (const a of K.articles) {
  if (a.category === 'Using this app') continue;          // app help stays in Copilot (Help)
  const links = a.links || [];
  const body = a.pending ? '' : (a.body || []).join('\n\n') + (links.length ? '\n\n**Read more**\n' + links.map((l) => `- [${l.label}](${l.url})`).join('\n') : '');
  const url = a.pending && links[0] ? links[0].url : '';
  out.push(`INSERT OR IGNORE INTO library (id, kind, title, author, url, summary, body, icon, topics, pinned, status, priority, created_at, updated_at) VALUES (${q(a.id)}, 'article', ${q(a.title)}, 'Science of Spirituality', ${q(url)}, ${q(a.summary)}, ${q(body)}, ${q(a.icon)}, ${q(TOPIC[a.id] || 'basics')}, ${K.featured.includes(a.id) ? 1 : 0}, 'approved', ${pr}, strftime('%s','now') * 1000, strftime('%s','now') * 1000);`);
  pr += 10;
}
const Q = JSON.parse(fs.readFileSync(ROOT + 'content/quizzes.json', 'utf8')).quizzes;
Q.forEach((z, i) => {
  const quiz = { questions: z.questions, related: z.related || [], reviewNote: z.reviewNote || '' };
  out.push(`INSERT OR IGNORE INTO library (id, kind, title, author, summary, icon, topics, quiz, pass_mark, retry_minutes, status, priority, created_at, updated_at) VALUES (${q(z.id)}, 'quiz', ${q(z.title)}, 'Draft for review', ${q(z.summary)}, '🧩', ${q(z.topics.join(','))}, ${q(JSON.stringify(quiz))}, 8, 10, 'draft', ${(i + 1) * 10}, strftime('%s','now') * 1000, strftime('%s','now') * 1000);`);
});
process.stdout.write(out.join('\n') + '\n');
