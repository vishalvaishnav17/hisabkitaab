import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from './index';

function createStubAssets(distDir = 'dist'): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      const url = new URL(urlStr);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = join(distDir, pathname.replace(/^\//, ''));

      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        return new Response('Not Found', { status: 404 });
      }

      const content = readFileSync(filePath);
      const contentType = pathname.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : pathname.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : pathname.endsWith('.png')
        ? 'image/png'
        : pathname.endsWith('.webmanifest') || pathname.endsWith('.json')
        ? 'application/json'
        : pathname.endsWith('.css')
        ? 'text/css'
        : 'application/octet-stream';

      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': contentType,
        },
      });
    },
    connect: () => {
      throw new Error('not used');
    },
  } as Fetcher;
}

const gate = {
  fetch: async () =>
    new Response(null, {
      status: 204,
      headers: { 'x-clerk-gate': 'ok' },
    }),
  connect: () => {
    throw new Error('not used');
  },
} as Fetcher;

describe('iphone web app', () => {
  let stubAssets: Fetcher;

  beforeAll(() => {
    const build = Bun.spawnSync(['bun', 'run', 'build']);
    if (build.exitCode !== 0) {
      throw new Error(`Build failed: ${build.stderr.toString()}`);
    }
    stubAssets = createStubAssets('dist');
  });

  test('dist/index.html has the manifest link, apple metas, viewport-fit=cover, id="transactionsCards" and id="installHint"', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('rel="manifest');
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style"');
    expect(html).toContain('name="apple-mobile-web-app-title"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('href="/icons/apple-touch-icon.png"');
    expect(html).toContain('id="transactionsCards"');
    expect(html).toContain('id="installHint"');
  });

  test('install files are public and the ledger stays behind auth', async () => {
    const manifestRes = await app.request('http://localhost/manifest.webmanifest', {}, { ASSETS: stubAssets });
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-type')).toContain('application/manifest+json');
    const manifest = (await manifestRes.json()) as { display: string; start_url: string; name: string };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.name).toBe('HisabKitaab');

    for (const name of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
      const res = await app.request('http://localhost/icons/' + name, {}, { ASSETS: stubAssets });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
      const served = Buffer.from(await res.arrayBuffer());
      const disk = readFileSync('dist/icons/' + name);
      expect(served.equals(disk)).toBe(true);
    }

    const missing = await app.request('http://localhost/icons/nope.png', {}, { ASSETS: stubAssets });
    expect(missing.status).toBe(404);

    const sw = await app.request('http://localhost/sw.js', {}, { ASSETS: stubAssets });
    expect(sw.status).toBe(200);
    expect(sw.headers.get('content-type')).toContain('javascript');
    expect(await sw.text()).toContain("addEventListener('fetch'");

    // / without a passing gate is blocked
    const homeBlocked = await app.request('http://localhost/', {}, { ASSETS: stubAssets });
    expect(homeBlocked.status).toBe(503);

    // / with a passing gate returns HTML from ASSETS
    const homeAuthed = await app.request('http://localhost/', {}, { ASSETS: stubAssets, CLERK_GATE: gate });
    expect(homeAuthed.status).toBe(200);
    expect(homeAuthed.headers.get('content-type')).toContain('text/html');
    expect(homeAuthed.headers.get('cache-control')).toBe('no-cache');
    const homeHtml = await homeAuthed.text();
    expect(homeHtml).toContain('id="transactionsCards"');
    expect(homeHtml).toContain('id="installHint"');
  });
});
