import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock browser storage for Node.js environment
const mockStorage: Record<string, string> = {};
const mockSession: Record<string, string> = {};

(globalThis as unknown as { localStorage: unknown; sessionStorage: unknown; window: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = val;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
};
(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
  getItem: (key: string) => mockSession[key] ?? null,
  setItem: (key: string, val: string) => {
    mockSession[key] = val;
  },
  removeItem: (key: string) => {
    delete mockSession[key];
  },
  clear: () => {
    for (const k in mockSession) delete mockSession[k];
  },
};

import {
  DEFAULT_PIN,
  getStoredPin,
  isPinProtectionEnabled,
  isSessionUnlocked,
  lockSession,
  resetPinToDefault,
  setPinProtectionEnabled,
  setStoredPin,
  unlockSession,
} from './PinSecurity.js';

describe('PinSecurity Beta Gatekeeper', () => {
  beforeEach(() => {
    for (const k in mockStorage) delete mockStorage[k];
    for (const k in mockSession) delete mockSession[k];
  });

  it('defaults to enabled with PIN 150116 when unconfigured', () => {
    assert.equal(isPinProtectionEnabled(), true);
    assert.equal(getStoredPin(), '150116');
    assert.equal(isSessionUnlocked(), false);
  });

  it('unlocks and locks session correctly', () => {
    assert.equal(isSessionUnlocked(), false);
    unlockSession();
    assert.equal(isSessionUnlocked(), true);
    lockSession();
    assert.equal(isSessionUnlocked(), false);
  });

  it('allows updating the stored PIN', () => {
    setStoredPin('987654');
    assert.equal(getStoredPin(), '987654');
  });

  it('allows disabling PIN protection', () => {
    setPinProtectionEnabled(false);
    assert.equal(isPinProtectionEnabled(), false);
    // When disabled, session is always considered unlocked
    assert.equal(isSessionUnlocked(), true);
  });

  it('allows re-enabling PIN protection', () => {
    setPinProtectionEnabled(false);
    assert.equal(isPinProtectionEnabled(), false);
    setPinProtectionEnabled(true);
    assert.equal(isPinProtectionEnabled(), true);
  });

  it('resets to factory default 150116', () => {
    setStoredPin('112233');
    setPinProtectionEnabled(false);
    resetPinToDefault();
    assert.equal(getStoredPin(), DEFAULT_PIN);
    assert.equal(isPinProtectionEnabled(), true);
  });
});
