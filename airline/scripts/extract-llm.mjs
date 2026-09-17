// One-shot migration: move the LLM transport layer out of App.jsx into src/llm.js.
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '..', 'src', 'App.jsx');
const original = fs.readFileSync(file, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';

const edits = [
  {
    name: 'import llm module',
    re: /\} from 'lucide-react';\r?\n/,
    to: `} from 'lucide-react';${eol}${eol}import { callLlm, cleanAndParseJson } from './llm';${eol}`
  },
  {
    name: 'remove cleanAndParseJson definition',
    re: /\/\*\*\r?\n \* Safely parses JSON strings returned by LLMs\.[\s\S]*?\r?\n\};\r?\n/,
    to: ''
  },
  {
    name: 'slim callLlmApi to a delegating wrapper',
    re: /  const callLlmApi = async \(\{ systemPrompt, chatHistory = \[\], jsonSchema = null, overrideMaxTokens = null \}\) => \{[\s\S]*?\r?\n  \};\r?\n/,
    to: [
      '  const callLlmApi = async ({ systemPrompt, chatHistory = [], jsonSchema = null, overrideMaxTokens = null }) => {',
      '    setApiError(null);',
      '',
      '    return callLlm({',
      '      provider,',
      '      baseUrl,',
      '      apiKey,',
      '      modelId,',
      '      systemPrompt,',
      '      chatHistory,',
      '      jsonSchema,',
      '      temperature,',
      '      topP,',
      '      maxTokens,',
      '      overrideMaxTokens',
      '    });',
      '  };',
      ''
    ].join(eol)
  }
];

let next = original;
for (const edit of edits) {
  const matches = next.match(new RegExp(edit.re.source, 'g')) ?? [];
  if (matches.length !== 1) {
    throw new Error(`"${edit.name}" matched ${matches.length} times (expected 1) - aborting, file untouched.`);
  }
  next = next.replace(edit.re, () => edit.to);
  console.log(`ok  ${edit.name}`);
}

if (next === original) throw new Error('no changes made');
fs.writeFileSync(file, next, 'utf8');

const lines = (s) => s.split(/\r?\n/).length;
console.log(`\nApp.jsx: ${lines(original)} -> ${lines(next)} lines`);
console.log(`local import present : ${next.includes("from './llm';")}`);
console.log(`cleanAndParseJson def: ${/const cleanAndParseJson/.test(next)} (expect false)`);
console.log(`callLlmApi wrapper    : ${/setApiError\(null\);\r?\n\r?\n    return callLlm\(/.test(next)}`);
console.log(`fetch still in App    : ${/await fetch\(/.test(next)} (expect false)`);