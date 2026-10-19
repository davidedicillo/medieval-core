import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const manifest = JSON.parse(await fs.readFile(path.join(root, 'docs/agent/manifest.json'), 'utf8'));
const entries = [...manifest.documents, ...manifest.resources];
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const headingId = (text) => text.toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
export function documentationUrl(file, raw = false) {
  if (file === 'llms.txt') return '/llms.txt';
  const base = file.startsWith('docs/') ? '/docs/' + file.slice(5) : '/docs/files/' + file;
  return !raw && file.endsWith('.md') ? (file === 'docs/README.md' ? '/docs' : base.slice(0, -3)) : base;
}
export const servedManifest = {
  ...manifest,
  linkResolution: { file: 'Repository-relative source path', url: 'Absolute path relative to the target server origin' },
  documents: manifest.documents.map((entry) => ({ ...entry, url: documentationUrl(entry.file), markdownUrl: documentationUrl(entry.file, true) })),
  resources: manifest.resources.map((entry) => ({ ...entry, url: documentationUrl(entry.file, true) })),
};
const routes = new Map(entries.flatMap((entry) => [[documentationUrl(entry.file), entry], [documentationUrl(entry.file, true), entry]]));
routes.set('/docs/', entries[0]);
routes.set('/docs/README', entries[0]);

function linkTarget(target, file) {
  if (/^https?:\/\//i.test(target) || target.startsWith('#')) return target;
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const [local, hash] = target.split('#');
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), local));
  const entry = entries.find((item) => item.file === resolved);
  if (entry) return documentationUrl(entry.file) + (hash ? '#' + hash : '');
  if (resolved.startsWith('../') || resolved.startsWith('/')) return null;
  return 'https://github.com/davidedicillo/medieval-core/blob/main/' + resolved.split('/').map(encodeURIComponent).join('/') + (hash ? '#' + encodeURIComponent(hash) : '');
}

function inline(text, file) {
  const tokens = [];
  const token = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  let safe = text.replace(/`([^`]+)`/g, (_, code) => token('<code>' + escape(code) + '</code>'));
  safe = safe.replace(/!?\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, href) => {
    const target = linkTarget(href, file);
    const content = escape(label).replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[i]);
    return token(target ? '<a href="' + escape(target) + '">' + content + '</a>' : content);
  });
  safe = escape(safe).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return safe.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[i]);
}

// Deliberately small, escaped Markdown subset: no raw HTML, executable code, or remote embeds.
export function renderMarkdown(source, file) {
  const lines = source.split(/\r?\n/), html = [], headings = [], ids = new Map();
  let paragraph = [], list = null;
  const closeParagraph = () => { if (paragraph.length) html.push('<p>' + inline(paragraph.join(' '), file) + '</p>'); paragraph = []; };
  const closeList = () => { if (list) html.push('</' + list + '>'); list = null; };
  const close = () => { closeParagraph(); closeList(); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      close(); const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      html.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>'); continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      close(); const base = headingId(heading[2]), count = ids.get(base) || 0;
      ids.set(base, count + 1); const id = base + (count ? '-' + count : '');
      html.push(`<h${heading[1].length} id="${escape(id)}">${inline(heading[2], file)}</h${heading[1].length}>`);
      if (heading[1].length === 2) headings.push({ id, title: heading[2] }); continue;
    }
    if (line.startsWith('|') && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      close(); const cells = (row) => {
        const values = ['']; let inCode = false;
        for (const char of row.trim().replace(/^\||\|$/g, '')) {
          if (char === '`') inCode = !inCode;
          if (char === '|' && !inCode) values.push(''); else values[values.length - 1] += char;
        }
        return values.map((value) => value.trim());
      };
      html.push('<div class="table"><table><thead><tr>' + cells(line).map((v) => '<th>' + inline(v, file) + '</th>').join('') + '</tr></thead><tbody>'); i++;
      while (lines[i + 1]?.startsWith('|')) html.push('<tr>' + cells(lines[++i]).map((v) => '<td>' + inline(v, file) + '</td>').join('') + '</tr>');
      html.push('</tbody></table></div>'); continue;
    }
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.+)$/);
    if (item) { closeParagraph(); const kind = item[1] ? 'ul' : 'ol'; if (list !== kind) { closeList(); list = kind; html.push('<' + kind + (kind === 'ol' ? ' start="' + Number(item[2]) + '"' : '') + '>'); } html.push('<li>' + inline(item[3], file) + '</li>'); continue; }
    if (!line.trim()) { close(); continue; }
    if (/^>\s?/.test(line)) { close(); html.push('<blockquote>' + inline(line.replace(/^>\s?/, ''), file) + '</blockquote>'); continue; }
    closeList(); paragraph.push(line);
  }
  close(); return { html: html.join('\n'), headings };
}

const css = `:root{color-scheme:light;--ink:#17202c;--muted:#576776;--line:#dbe2e8;--accent:#285d82}*{box-sizing:border-box}body{margin:0;font:16px/1.65 system-ui,sans-serif;color:var(--ink);background:#fff}header{padding:18px 30px;border-bottom:1px solid var(--line);display:flex;gap:24px;align-items:center;flex-wrap:wrap}a{color:var(--accent);text-underline-offset:3px}header strong{font-size:20px}header form{margin-left:auto;display:flex;gap:8px}input,button{font:inherit;padding:7px 10px;border:1px solid #aebecb;border-radius:6px;background:white}button{cursor:pointer}main{display:grid;grid-template-columns:225px minmax(0,880px) 185px;gap:36px;max-width:1460px;margin:auto;padding:30px}nav a{display:block;padding:5px 8px;border-radius:5px;text-decoration:none}nav a[aria-current=page]{background:#edf3f7;font-weight:650}aside{font-size:14px}article{min-width:0}h1{font-size:34px;line-height:1.2;margin-top:0}h2{font-size:23px;margin-top:36px}h3{font-size:19px}h1,h2,h3{scroll-margin-top:20px}p{margin:14px 0}li{margin:7px 0}pre{padding:18px;background:#f3f6f8;border:1px solid var(--line);border-radius:8px;overflow:auto;font-size:13px;line-height:1.6}code{font:0.9em ui-monospace,monospace;overflow-wrap:anywhere}p code,li code,td code{background:#f1f4f6;padding:2px 4px;border-radius:3px}.table{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:11px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f3f6f8}blockquote{margin:15px 0;padding-left:16px;border-left:3px solid #a9c2d4;color:var(--muted)}.meta{color:var(--muted);font-size:13px;margin-bottom:22px}.meta a{margin-right:14px}.notice{padding:12px 16px;background:#f3f6f8;border-radius:6px;font-size:14px}footer{border-top:1px solid var(--line);padding:24px 30px;color:var(--muted);font-size:13px}@media(max-width:1100px){main{grid-template-columns:210px minmax(0,1fr)}aside{display:none}}@media(max-width:700px){header{padding:16px}header form{margin-left:0;width:100%}input{min-width:0;width:100%}main{display:block;padding:20px}nav{margin-bottom:26px;display:flex;overflow:auto;gap:8px}nav a{white-space:nowrap}h1{font-size:28px}}`;

function page({ entry, html, headings = [], query = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(entry.title)} | MediEval Docs</title><link rel="alternate" type="application/json" href="/docs/agent/manifest.json"><style>${css}</style></head><body><header><a href="/">MediEval</a><strong>Documentation</strong><a href="/docs/AGENTS">For agents</a><form action="/docs" role="search"><input name="q" aria-label="Search documentation" placeholder="Search guides" value="${escape(query)}"><button>Search</button></form></header><main><nav aria-label="Documentation guides">${manifest.documents.filter((d) => d.combined).map((d) => `<a href="${documentationUrl(d.file)}"${d.id === entry.id ? ' aria-current="page"' : ''}>${escape(d.title)}</a>`).join('')}</nav><article><div class="meta">Source documentation · v${escape(manifest.documentationVersion)} · ${escape(manifest.reviewedOn)}<br><a href="${documentationUrl(entry.file, true)}">Markdown source</a><a href="/docs/agent/manifest.json">Machine manifest</a><a href="/llms-full.txt">All guides as text</a></div>${html}</article><aside aria-label="On this page"><strong>On this page</strong>${headings.map((h) => `<p><a href="#${escape(h.id)}">${escape(h.title)}</a></p>`).join('')}</aside></main><footer>Source support can differ from your deployment. <a href="/docs/OPERATIONS">Check your environment</a> · <a href="/docs/files/SECURITY">Report a vulnerability</a></footer></body></html>`;
}

export async function serveDocumentation(req, res, url) {
  if (!['/llms.txt', '/llms-full.txt', '/docs'].includes(url.pathname) && !url.pathname.startsWith('/docs/')) return false;
  const send = (status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : body); return true;
  };
  if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Documentation supports GET and HEAD.');
  if (url.pathname === '/llms-full.txt') {
    const texts = await Promise.all(manifest.documents.filter((d) => d.combined).map(async (d) => `<!-- source: ${d.file} -->\n${await fs.readFile(path.join(root, d.file), 'utf8')}`));
    return send(200, `MediEval documentation ${manifest.documentationVersion}; source checkout; reviewed ${manifest.reviewedOn}\n\n` + texts.join('\n\n---\n\n'));
  }
  const entry = routes.get(url.pathname);
  if (!entry) return send(404, 'Documentation page not found.');
  if (entry.id === 'manifest') return send(200, JSON.stringify(servedManifest, null, 2) + '\n', 'application/json; charset=utf-8');
  const source = await fs.readFile(path.join(root, entry.file), 'utf8');
  if (!entry.file.endsWith('.md') || url.pathname.endsWith('.md')) return send(200, source, (entry.mediaType || 'text/markdown') + '; charset=utf-8');
  const query = (url.searchParams.get('q') || '').trim().slice(0, 150);
  if (query && entry.id === 'index') {
    const terms = query.toLowerCase().split(/\s+/);
    const results = await Promise.all(manifest.documents.map(async (d) => {
      const text = await fs.readFile(path.join(root, d.file), 'utf8');
      return terms.every((term) => (d.title + '\n' + text).toLowerCase().includes(term)) ? `<li><a href="${documentationUrl(d.file)}">${escape(d.title)}</a></li>` : '';
    }));
    return send(200, page({ entry, query, html: `<h1>Search results</h1><p>Matches for “${escape(query)}”</p>${results.some(Boolean) ? '<ul>' + results.join('') + '</ul>' : '<p>No matching guide. Try a shorter term, such as “qualification” or “outbox”.</p>'}` }), 'text/html; charset=utf-8');
  }
  return send(200, page({ entry, ...renderMarkdown(source, entry.file) }), 'text/html; charset=utf-8');
}
