// A small, safe Markdown renderer for wiki pages: headings, lists, checkboxes,
// quotes, code, bold/italic/inline code and links. It builds React elements
// (never raw HTML), so nothing a user writes can run as script.

const LINK_RE = /^(https?:\/\/|mailto:|\/)/i;

// Inline: **bold**, *italic*, `code`, [text](url)
function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key} className="px-1 py-0.5 rounded bg-gray-100 text-[0.9em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      const href = t.slice(t.indexOf("(") + 1, -1);
      out.push(LINK_RE.test(href)
        ? <a key={key} href={href} className="underline text-gray-900" target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{label}</a>
        : label);
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={key} className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs overflow-x-auto"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const cls = ["text-xl font-semibold mt-4", "text-lg font-semibold mt-4", "text-base font-semibold mt-3"][h[1].length - 1];
      const Tag = `h${h[1].length + 1}`;
      blocks.push(<Tag key={key} className={`${cls} text-gray-900`}>{inline(h[2], key)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        const box = raw.match(/^\[( |x)\]\s+(.*)$/i);
        items.push(
          <li key={`${key}-${items.length}`}>
            {box ? <><input type="checkbox" checked={box[1] !== " "} readOnly className="mr-1.5 align-middle" />{inline(box[2], `${key}-${items.length}`)}</> : inline(raw, `${key}-${items.length}`)}
          </li>
        );
        i++;
      }
      blocks.push(ordered
        ? <ol key={key} className="list-decimal pl-6 space-y-0.5">{items}</ol>
        : <ul key={key} className="list-disc pl-6 space-y-0.5">{items}</ul>);
      continue;
    }
    if (line.startsWith(">")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} className="border-l-2 border-gray-300 pl-3 text-gray-600">{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key} className="border-gray-200" />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]); // never stall on a line no rule took
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return <div className="space-y-2 text-sm text-gray-800 leading-relaxed">{blocks}</div>;
}
