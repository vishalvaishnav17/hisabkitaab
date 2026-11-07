import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Activity UI & Navigation', () => {
  test('dist/index.html contains bottom tab bar with 5 tabs and safe-area insets', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('id="bottomTabBar"');
    expect(html).toContain('data-tab="personal"');
    expect(html).toContain('data-tab="groups"');
    expect(html).toContain('data-tab="friends"');
    expect(html).toContain('data-tab="bills"');
    expect(html).toContain('data-tab="activity"');
    expect(html).toContain('env(safe-area-inset-bottom)');
  });

  test('dist/index.html contains all 5 view containers for route switching', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('id="view-dashboard"');
    expect(html).toContain('id="view-groups"');
    expect(html).toContain('id="view-friends"');
    expect(html).toContain('id="view-bills"');
    expect(html).toContain('id="view-activity"');
  });

  test('dist/index.html positions toast above the tab bar and safe-area inset', () => {
    const html = readFileSync('dist/index.html', 'utf-8');
    expect(html).toContain('id="toastContainer"');
    expect(html).toContain('bottom-[calc(4.5rem+env(safe-area-inset-bottom))]');
  });
});
