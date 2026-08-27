import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves api/*.ts during `npm run dev`.
 *
 * Vite has no notion of Vercel Functions, so without this /api/generate is a
 * 404 locally and /generate is the one screen that cannot be exercised — which
 * is precisely the screen worth exercising.
 *
 * `apply: 'serve'` keeps it out of the production build entirely: on Vercel the
 * real platform runs the function and this plugin does not exist.
 *
 * The shim is deliberately small. It gives the handler the four things it
 * actually uses — method, headers, a parsed body, and status()/json() — rather
 * than pretending to reimplement Vercel's runtime. Two things it does NOT
 * reproduce, both worth remembering when something behaves differently here
 * than in production:
 *
 *   - maxDuration. Nothing kills a slow handler locally, so the timing budget
 *     in api/generate.ts is never enforced.
 *   - waitUntil. Locally the process stays alive on its own, so background work
 *     after the response completes whether or not waitUntil is wired correctly.
 */
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const rawBody = Buffer.concat(chunks).toString('utf8');

          const request = req as IncomingMessage & { body?: unknown; query?: unknown };
          request.body = rawBody ? JSON.parse(rawBody) : undefined;
          request.query = {};

          const response = res as ServerResponse & {
            status?: (code: number) => unknown;
            json?: (payload: unknown) => unknown;
          };
          response.status = (code: number) => {
            response.statusCode = code;
            return response;
          };
          response.json = (payload: unknown) => {
            if (!response.headersSent) response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(payload));
            return response;
          };

          // ssrLoadModule transpiles the TypeScript and picks up edits without
          // a restart, so the handler stays as hot-reloadable as the client.
          const mod = await server.ssrLoadModule('/api/generate.ts');
          await (mod.default as (q: unknown, s: unknown) => Promise<void>)(request, response);
        } catch (e) {
          // Only reachable if the shim itself breaks — the handler has its own
          // catch. Without this the dev server hangs instead of answering.
          server.config.logger.error(`[vercel-api-dev] ${String(e)}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `dev shim failed: ${String(e)}` }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed variables, and only on import.meta.env.
  // The handler reads process.env, and the two values it needs are the two that
  // must never carry the prefix — so they are loaded here and copied across,
  // for the dev server only.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  // api/generate.ts falls back to the VITE_ names for the URL and anon key,
  // which are public by design.
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), vercelApiDev()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  };
});
