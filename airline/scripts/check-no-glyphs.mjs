// Pre-commit guard: no UI glyphs (arrows, geometric shapes, dingbats, emoji)
// in source. Typographic punctuation (curly quotes, middots, euro/pound signs,
// em dashes, ellipsis) is allowed - it is text, not iconography.
// Every icon must come from lucide-react.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const GLYPH = /[\u2190-\u21FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]/gu;

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|html|css)$/.test(entry.name)) out.push(full);
  }
  return out;
};

const files = [...walk(path.join(root, 'src')), path.join(root, 'index.html')];
let failures = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    const hits = line.match(GLYPH);
    if (hits) {
      for (const ch of new Set(hits)) {
        failures += 1;
        console.log(
          `${path.relative(root, file)}:${i + 1}: ${ch} ` +
          `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  |  ${line.trim().slice(0, 80)}`
        );
      }
    }
  });
}

console.log(failures ? `\nFAIL: ${failures} UI glyph(s) - replace with lucide-react icons` : 'OK: no UI glyphs in source');
process.exit(failures ? 1 : 0);
