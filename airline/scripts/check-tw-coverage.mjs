// Dev-only coverage check: verifies every Tailwind class referenced in src/App.jsx
// produced a rule in the built stylesheet (dist/assets/*.css).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appPath = path.join(root, 'src', 'App.jsx');
const assetsDir = path.join(root, 'dist', 'assets');
const cssName = fs.readdirSync(assetsDir).find((f) => f.endsWith('.css'));
const css = fs.readFileSync(path.join(assetsDir, cssName), 'utf8');
const src = fs.readFileSync(appPath, 'utf8');

const PREFIXES =
  'bg|text|border|ring|fill|stroke|w|h|min|max|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|flex|grid|items|justify|gap|space|rounded|shadow|opacity|transition|duration|delay|ease|animate|font|tracking|leading|uppercase|lowercase|capitalize|truncate|whitespace|shrink|grow|inline|block|hidden|cursor|select|resize|basis|self|order|col|row|inset|top|left|right|bottom|z|rotate|scale|translate|backdrop|blur|outline|appearance|placeholder|list|decoration|indent|align|table|columns|aspect|object|float|clear|isolate|mix|filter|accent|caret|scroll|snap|touch|will|content|sr|container|divide|from|via|to|sticky|fixed|static|relative|absolute|visible|invisible|break|line|overflow|antialiased';
const looksTailwind = new RegExp(`^(?:[a-z0-9]+:)*(${PREFIXES})(-|$)`);

// Collect raw text of every className attribute (string, template literal, or expression).
const tokens = new Set();
const attrRe = /className\s*=\s*(?:"[^"]*"|\{`[\s\S]*?`\}|\{[^}]*\})/g;
for (const attr of src.match(attrRe) ?? []) {
  for (const s of attr.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? []) {
    const inner = s.slice(1, -1);
    if (inner.includes('${')) {
      for (const q of inner.match(/'[^']*'|"[^"]*"/g) ?? []) {
        for (const t of q.slice(1, -1).split(/\s+/)) if (t) tokens.add(t);
      }
    } else {
      for (const t of inner.split(/\s+/)) if (t) tokens.add(t);
    }
  }
}

// Escape exactly like Tailwind does when it emits a selector.
const escape = (t) => t.replace(/[!#%&()*+,./:;<=>?@[\]^`{|}~'"]/g, (c) => '\\' + c);

const checked = [...tokens].filter((t) => looksTailwind.test(t)).sort();
const custom = [...tokens].filter((t) => !looksTailwind.test(t)).sort();
const missing = checked.filter((t) => !css.includes('.' + escape(t)));

console.log(`css file      : ${cssName} (${css.length} chars)`);
console.log(`class tokens  : ${tokens.size}`);
console.log(`tailwind util : ${checked.length}`);
console.log(`non-tailwind  : ${custom.length} -> ${custom.join(', ')}`);
console.log(`MISSING       : ${missing.length}${missing.length ? ' -> ' + missing.join(', ') : ''}`);
process.exit(missing.length ? 1 : 0);