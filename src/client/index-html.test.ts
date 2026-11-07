import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const EXPECTED_VIEWS = [
  'view-dashboard',
  'view-groups',
  'view-friends',
  'view-bills',
  'view-activity',
];

describe('index.html view hierarchy', () => {
  test('all five view-* elements are direct children of <main> and not nested in another view', async () => {
    const html = readFileSync('src/client/index.html', 'utf-8');

    const directChildrenOfMain: string[] = [];
    const nestedViews: string[] = [];

    await new HTMLRewriter()
      .on('main > div', {
        element(el) {
          const id = el.getAttribute('id');
          if (id) {
            directChildrenOfMain.push(id);
          }
        },
      })
      .on('[id^="view-"] [id^="view-"]', {
        element(el) {
          const id = el.getAttribute('id');
          if (id) {
            nestedViews.push(id);
          }
        },
      })
      .transform(new Response(html))
      .text();

    for (const viewId of EXPECTED_VIEWS) {
      expect(directChildrenOfMain).toContain(viewId);
    }
    expect(nestedViews).toEqual([]);
  });
});
