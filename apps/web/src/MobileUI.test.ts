import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InfoTip } from './components/InfoTip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('Mobile UI & Accessibility Optimizations', () => {
  it('InfoTip renders accessible button with svg icon and aria attributes', () => {
    const markup = renderToStaticMarkup(
      React.createElement(InfoTip, {
        title: 'Spiegazione Test',
        text: 'Questo è un testo informativo.',
      })
    );

    assert.ok(markup.includes('infotip-wrapper'), 'Includes wrapper class');
    assert.ok(markup.includes('infotip-btn'), 'Includes button class');
    assert.ok(markup.includes('aria-label="Spiegazione Test"'), 'Sets title as aria-label');
    assert.ok(markup.includes('aria-expanded="false"'), 'Defaults to aria-expanded false');
    assert.ok(markup.includes('<svg'), 'Includes info icon svg');
  });

  it('Verifies elimination of DB codes in parentheses and SQL jargon from components', () => {
    const componentsDir = path.join(webRoot, 'src', 'components');
    const filesToCheck = [
      'DashboardTab.tsx',
      'TransactionsTab.tsx',
      'TricountTab.tsx',
      'LoansTab.tsx',
      'CryptoTab.tsx',
      'PersistenceHeader.tsx',
    ];

    const forbiddenPatterns = [
      'SELECT * FROM widget_snapshot',
      'widget_snapshot',
      '(expense)',
      '(income)',
      '(transfer)',
      '(loan_movement)',
      '(tricount_settlement)',
      '(base_amount)',
      '(widget_snapshot)',
      '(transaction_splits)',
      'transaction_splits',
      '(calculateCryptoAssetMetrics)',
      'calculateCryptoAssetMetrics',
      '(lent & borrowed)',
      '(inline_blob)',
      'inline_blob',
      'O(1) Native Read',
      'Incluso (1)',
      'Escluso (0)',
      'include_in_budget = 1',
      'count_installments_in_budget = 1',
      'WAC Basis',
    ];

    for (const filename of filesToCheck) {
      const filePath = path.join(componentsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      for (const pattern of forbiddenPatterns) {
        assert.ok(
          !content.includes(pattern),
          `File ${filename} must not contain forbidden pattern: "${pattern}"`
        );
      }
    }
  });

  it('Ensures DashboardTab includes Quick Actions hub buttons', () => {
    const dashboardPath = path.join(webRoot, 'src', 'components', 'DashboardTab.tsx');
    const content = fs.readFileSync(dashboardPath, 'utf8');

    assert.ok(content.includes('quick-actions-grid'), 'Includes quick-actions-grid');
    assert.ok(content.includes('Spesa Rapida'), 'Includes Spesa Rapida action');
    assert.ok(content.includes('Nuova Entrata'), 'Includes Nuova Entrata action');
    assert.ok(content.includes('Giroconto'), 'Includes Giroconto action');
    assert.ok(content.includes('Spesa Gruppo'), 'Includes Spesa Gruppo action');
    assert.ok(content.includes('btn-sweep-savings'), 'Preserves btn-sweep-savings button');
    assert.ok(content.includes('Spese di Oggi'), 'Includes Spese di Oggi section');
    assert.ok(content.includes('I Miei Conti'), 'Includes I Miei Conti section');
    assert.ok(content.includes('Anteprima Widget &amp; Orologio') || content.includes('Anteprima Widget & Orologio'), 'Includes Anteprima Widget & Orologio');
  });

  it('Ensures index.css does not have typography font-size below 0.85rem in regular styles', () => {
    const cssPath = path.join(webRoot, 'src', 'index.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Matches font-size: 0.XXrem where XX < 85
    const regex = /font-size:\s*0\.([0-7][0-9]|8[0-4])rem/g;
    const matches = css.match(regex);
    assert.equal(
      matches,
      null,
      `index.css must not have font-size below 0.85rem, found: ${matches?.join(', ')}`
    );
  });

  it('Ensures touch targets for buttons and inputs satisfy at least 44px min-height in CSS', () => {
    const cssPath = path.join(webRoot, 'src', 'index.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('min-height: 44px'), 'Includes min-height: 44px for buttons/inputs');
    assert.ok(css.includes('min-height: 48px'), 'Includes min-height: 48px for bottom nav items');
    assert.ok(css.includes('.infotip-wrapper'), 'Includes infotip-wrapper style');
    assert.ok(css.includes('.quick-modal-backdrop'), 'Includes quick-modal-backdrop style');
  });
});
