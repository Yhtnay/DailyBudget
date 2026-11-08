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
  getStoredPin,
  isPinProtectionEnabled,
  isSessionUnlocked,
  lockSession,
  removePinProtection,
  setPinProtection,
  unlockSession,
} from './PinSecurity.js';

describe('PinSecurity Optional Local Gatekeeper', () => {
  beforeEach(() => {
    for (const k in mockStorage) delete mockStorage[k];
    for (const k in mockSession) delete mockSession[k];
  });

  it('defaults to disabled with no PIN configured at first launch', () => {
    assert.equal(isPinProtectionEnabled(), false);
    assert.equal(getStoredPin(), null);
    assert.equal(isSessionUnlocked(), true);
  });

  it('activates protection when user sets a custom PIN', () => {
    setPinProtection('4321');
    assert.equal(isPinProtectionEnabled(), true);
    assert.equal(getStoredPin(), '4321');
    assert.equal(isSessionUnlocked(), true);
  });

  it('locks and unlocks session when PIN is enabled', () => {
    setPinProtection('9876');
    lockSession();
    assert.equal(isSessionUnlocked(), false);
    unlockSession();
    assert.equal(isSessionUnlocked(), true);
  });

  it('updates stored PIN when user changes it', () => {
    setPinProtection('1234');
    setPinProtection('5678');
    assert.equal(getStoredPin(), '5678');
    assert.equal(isPinProtectionEnabled(), true);
  });

  it('removes PIN protection completely on user request', () => {
    setPinProtection('9999');
    assert.equal(isPinProtectionEnabled(), true);

    removePinProtection();
    assert.equal(isPinProtectionEnabled(), false);
    assert.equal(getStoredPin(), null);
    assert.equal(isSessionUnlocked(), true);
  });
});
