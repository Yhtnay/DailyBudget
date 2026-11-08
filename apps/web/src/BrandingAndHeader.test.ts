import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DailyBudgetAppIcon } from './components/DailyBudgetAppIcon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('Branding and Public Assets Verification', () => {
  it('DailyBudgetAppIcon renders valid SVG with default size and accessibility attributes', () => {
    const markup = renderToStaticMarkup(React.createElement(DailyBudgetAppIcon));
    assert.ok(markup.startsWith('<svg'), 'Markup starts with <svg>');
    assert.ok(markup.includes('viewBox="0 0 512 512"'), 'Includes viewBox 512 512');
    assert.ok(markup.includes('width="34"'), 'Default width is 34');
    assert.ok(markup.includes('height="34"'), 'Default height is 34');
    assert.ok(markup.includes('aria-label="DailyBudget"'), 'Includes accessible aria-label');
    assert.ok(markup.includes('<title>DailyBudget</title>'), 'Includes title tag');
    assert.ok(markup.includes('db-bg-grad'), 'Includes background gradient');
    assert.ok(markup.includes('db-gold-grad'), 'Includes gold coin gradient');
    assert.ok(markup.includes('db-vault-white'), 'Includes vault monogram elements');
  });

  it('DailyBudgetAppIcon supports custom size, class, and custom title', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DailyBudgetAppIcon, {
        size: 64,
        className: 'custom-brand-logo',
        title: 'App Icon Custom',
      })
    );
    assert.ok(markup.includes('width="64"'));
    assert.ok(markup.includes('height="64"'));
    assert.ok(markup.includes('class="custom-brand-logo"'));
    assert.ok(markup.includes('aria-label="App Icon Custom"'));
    assert.ok(markup.includes('<title>App Icon Custom</title>'));
  });

  it('verifies public favicon and PWA icons exist with valid content', () => {
    const publicDir = path.join(webRoot, 'public');

    // 1. favicon.svg
    const svgPath = path.join(publicDir, 'favicon.svg');
    assert.ok(fs.existsSync(svgPath), 'favicon.svg must exist');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    assert.ok(svgContent.includes('<svg'), 'favicon.svg contains valid SVG opening tag');
    assert.ok(svgContent.includes('viewBox="0 0 512 512"'), 'favicon.svg has 512x512 viewBox');

    // 2. favicon.ico
    const icoPath = path.join(publicDir, 'favicon.ico');
    assert.ok(fs.existsSync(icoPath), 'favicon.ico must exist');
    const icoStat = fs.statSync(icoPath);
    assert.ok(icoStat.size > 1000, `favicon.ico size ${icoStat.size} bytes should be > 1000 bytes`);

    // 3. apple-touch-icon.png
    const applePath = path.join(publicDir, 'apple-touch-icon.png');
    assert.ok(fs.existsSync(applePath), 'apple-touch-icon.png must exist');
    const appleStat = fs.statSync(applePath);
    assert.ok(appleStat.size > 5000, 'apple-touch-icon.png has non-trivial size');

    // 4. pwa-192x192.png
    const pwa192Path = path.join(publicDir, 'pwa-192x192.png');
    assert.ok(fs.existsSync(pwa192Path), 'pwa-192x192.png must exist');
    assert.ok(fs.statSync(pwa192Path).size > 5000, 'pwa-192x192.png has non-trivial size');

    // 5. pwa-512x512.png
    const pwa512Path = path.join(publicDir, 'pwa-512x512.png');
    assert.ok(fs.existsSync(pwa512Path), 'pwa-512x512.png must exist');
    assert.ok(fs.statSync(pwa512Path).size > 10000, 'pwa-512x512.png has non-trivial size');

    // 6. site.webmanifest
    const manifestPath = path.join(publicDir, 'site.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'site.webmanifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'DailyBudget');
    assert.equal(manifest.short_name, 'DailyBudget');
    assert.equal(manifest.display, 'standalone');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'Manifest defines icons');
  });

  it('verifies index.html links to all branding and PWA assets', () => {
    const indexPath = path.join(webRoot, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    assert.ok(html.includes('href="./favicon.svg"'), 'index.html links to favicon.svg');
    assert.ok(html.includes('href="./favicon.ico"'), 'index.html links to favicon.ico');
    assert.ok(html.includes('href="./apple-touch-icon.png"'), 'index.html links to apple-touch-icon.png');
    assert.ok(html.includes('href="./site.webmanifest"'), 'index.html links to site.webmanifest');
    assert.ok(html.includes('name="apple-mobile-web-app-capable" content="yes"'), 'index.html enables apple mobile web app');
    assert.ok(html.includes('name="apple-mobile-web-app-title" content="DailyBudget"'), 'index.html sets apple title');
    assert.ok(html.includes('name="theme-color" content="#0f766e"'), 'index.html sets theme color');
  });

  it('verifies PersistenceHeader preserves all required action IDs and dropdown contract', () => {
    const headerPath = path.join(webRoot, 'src', 'components', 'PersistenceHeader.tsx');
    const headerCode = fs.readFileSync(headerPath, 'utf8');

    const expectedIds = [
      'btn-header-menu-trigger',
      'btn-save-disk-dbbudget',
      'btn-open-dbbudget',
      'btn-export-dbbudget',
      'btn-merge-dbbudget',
      'btn-new-workspace',
      'btn-reset-demo',
      'btn-sync-markets',
      'btn-toggle-theme',
      'btn-lock-session',
    ];

    for (const id of expectedIds) {
      assert.ok(headerCode.includes(`id="${id}"`), `PersistenceHeader must contain button id="${id}"`);
    }

    assert.ok(headerCode.includes('DailyBudgetAppIcon'), 'PersistenceHeader uses DailyBudgetAppIcon');
    assert.ok(headerCode.includes("e.key === 'Escape'"), 'PersistenceHeader handles Escape key to close menu');
    assert.ok(headerCode.includes('handleClickOutside'), 'PersistenceHeader handles click outside to close menu');
  });

  it('ensures zero floating-point arithmetic is introduced in Web UI files', () => {
    const filesToCheck = [
      path.join(webRoot, 'src', 'components', 'PersistenceHeader.tsx'),
      path.join(webRoot, 'src', 'components', 'DailyBudgetAppIcon.tsx'),
      path.join(webRoot, 'src', 'App.tsx'),
    ];

    for (const file of filesToCheck) {
      const code = fs.readFileSync(file, 'utf8');
      // Invariant: no float arithmetic applied to currency/accounting values
      assert.doesNotMatch(code, /\bparseFloat\b/, `${file} should not use parseFloat`);
    }
  });
});
