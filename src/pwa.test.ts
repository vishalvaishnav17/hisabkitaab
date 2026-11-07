import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import app from './index';
import { renderHtml } from './frontend';

function pageScript(html: string): string {
  const match = html.match(/<script>\s*let expenses = \[[\s\S]*<\/script>/);
  if (!match) throw new Error('page script missing');
  return match[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
}

describe('iphone web app', () => {
  test('page can be added to the home screen', () => {
    const html = renderHtml();
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('href="/icons/apple-touch-icon.png"');
    expect(html).toContain('id="transactionsCards"');
    expect(html).toContain('id="installHint"');
    new Function(pageScript(html));
  });

  test('install files are public and the ledger stays behind auth', async () => {
    const manifestRes = await app.request('http://localhost/manifest.webmanifest');
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get('content-type')).toContain('application/manifest+json');
    const manifest = await manifestRes.json() as { display: string; start_url: string; name: string };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.name).toBe('HisabKitaab');

    for (const name of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
      const res = await app.request('http://localhost/icons/' + name);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const served = Buffer.from(await res.arrayBuffer());
      const disk = readFileSync('public/icons/' + name);
      expect(served.equals(disk)).toBe(true);
    }

    const missing = await app.request('http://localhost/icons/nope.png');
    expect(missing.status).toBe(404);

    const sw = await app.request('http://localhost/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('content-type')).toContain('javascript');
    expect(await sw.text()).toContain("addEventListener('fetch'");

    const home = await app.request('http://localhost/', {}, {});
    expect(home.status).toBe(503);
  });
});
