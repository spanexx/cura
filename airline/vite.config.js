import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local LLM servers (Ollama, LM Studio, vLLM, LocalAI, ...) generally do not
// send CORS headers, so a browser page served from another origin cannot call
// them directly - the fetch is blocked before it leaves the browser.
// Proxying through the Vite server makes those calls same-origin.
// Point the app's Base URL at "/llm-proxy/v1" to use it.
// Override the target with:  $env:LLM_PROXY_TARGET = 'http://localhost:11434'
const llmProxy = {
  '/llm-proxy': {
    target: process.env.LLM_PROXY_TARGET || 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (requestPath) => requestPath.replace(/^\/llm-proxy/, '')
  }
};

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites serve under /<repo>/ - the deploy workflow sets
  // VITE_PUBLIC_BASE=/cura/ so asset URLs resolve. Local dev stays at '/'.
  base: process.env.VITE_PUBLIC_BASE || '/',
  server: {
    port: 5173,
    open: true,
    proxy: llmProxy
  },
  preview: {
    port: 4173,
    proxy: llmProxy
  }
});
