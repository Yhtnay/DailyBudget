import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Moon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  Unlock,
} from 'lucide-react';

export const PIN_STORAGE_KEY = 'dailybudget_pin_code';
export const PIN_ENABLED_KEY = 'dailybudget_pin_enabled';
export const PIN_SESSION_KEY = 'dailybudget_unlocked';

export function getStoredPin(): string | null {
  if (typeof window === 'undefined') return null;
  const pin = localStorage.getItem(PIN_STORAGE_KEY);
  return pin && pin.trim().length >= 4 ? pin.trim() : null;
}

export function isPinProtectionEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const isEnabled = localStorage.getItem(PIN_ENABLED_KEY) === 'true';
  const hasPin = Boolean(getStoredPin());
  return isEnabled && hasPin;
}

export function isSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return true;
  if (!isPinProtectionEnabled()) return true;
  return sessionStorage.getItem(PIN_SESSION_KEY) === 'true';
}

export function setPinProtection(newPin: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = newPin.trim();
  localStorage.setItem(PIN_STORAGE_KEY, trimmed);
  localStorage.setItem(PIN_ENABLED_KEY, 'true');
  sessionStorage.setItem(PIN_SESSION_KEY, 'true');
}

export function removePinProtection(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PIN_STORAGE_KEY);
  localStorage.setItem(PIN_ENABLED_KEY, 'false');
  sessionStorage.setItem(PIN_SESSION_KEY, 'true');
}

export function lockSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PIN_SESSION_KEY);
}

export function unlockSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PIN_SESSION_KEY, 'true');
}

// =========================================================
// 1. PIN LOCK SCREEN COMPONENT
// =========================================================

interface PinLockScreenProps {
  onUnlock: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  onUnlock,
  theme,
  onToggleTheme,
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [showDigits, setShowDigits] = useState<boolean>(false);

  const currentPin = getStoredPin() || '';
  const expectedLength = Math.max(4, currentPin.length);

  const triggerError = useCallback(() => {
    setIsShaking(true);
    setErrorMsg('PIN non corretto. Riprova.');
    setTimeout(() => {
      setIsShaking(false);
      setPinInput('');
    }, 550);
  }, []);

  const handleVerify = useCallback(
    (codeToTest: string) => {
      const targetPin = getStoredPin();
      if (targetPin && codeToTest === targetPin) {
        unlockSession();
        onUnlock();
      } else {
        triggerError();
      }
    },
    [onUnlock, triggerError]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (pinInput.length >= expectedLength) return;
      setErrorMsg(null);
      const next = pinInput + digit;
      setPinInput(next);
      if (currentPin && next.length === currentPin.length) {
        handleVerify(next);
      }
    },
    [pinInput, expectedLength, currentPin, handleVerify]
  );

  const handleDelete = useCallback(() => {
    setErrorMsg(null);
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMsg(null);
    setPinInput('');
  }, []);

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === 'Enter') {
        if (pinInput.length >= 4) {
          handleVerify(pinInput);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleDelete, handleClear, handleVerify, pinInput]);

  return (
    <div className="pin-lock-overlay">
      <div className="pin-lock-top-bar">
        <button
          type="button"
          className="action-btn"
          onClick={onToggleTheme}
          title="Cambia tema chiaro/scuro"
          aria-label="Cambia tema"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      <div className={`pin-card ${isShaking ? 'shake' : ''}`}>
        <div className="pin-card-header">
          <div className="pin-badge-icon">
            <ShieldCheck size={28} className="shield-icon" />
          </div>
          <h1 className="pin-card-title">DailyBudget</h1>
          <div className="pin-beta-pill">ACCESSO PROTETTO</div>
          <p className="pin-card-subtitle">
            Inserisci il codice PIN per accedere all'applicazione sul dispositivo.
          </p>
        </div>

        {/* Display Dots / Digits */}
        <div className="pin-display-cluster">
          <div className="pin-dots-container">
            {Array.from({ length: expectedLength }).map((_, idx) => {
              const isFilled = idx < pinInput.length;
              return (
                <div
                  key={idx}
                  className={`pin-dot ${isFilled ? 'filled' : ''} ${errorMsg ? 'error' : ''}`}
                >
                  {showDigits && isFilled ? (
                    <span className="pin-digit-text">{pinInput[idx]}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="pin-visibility-toggle"
            onClick={() => setShowDigits((v) => !v)}
            title={showDigits ? 'Nascondi cifre' : 'Mostra cifre'}
            aria-label={showDigits ? 'Nascondi cifre' : 'Mostra cifre'}
          >
            {showDigits ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {errorMsg && (
          <div className="pin-error-alert" role="alert">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Keypad */}
        <div className="pin-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="keypad-btn"
              onClick={() => handleDigit(digit)}
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            className="keypad-btn action-key"
            onClick={handleClear}
            title="Cancella tutto"
          >
            C
          </button>

          <button
            type="button"
            className="keypad-btn"
            onClick={() => handleDigit('0')}
          >
            0
          </button>

          <button
            type="button"
            className="keypad-btn action-key"
            onClick={handleDelete}
            title="Cancella ultima cifra"
          >
            <Delete size={18} />
          </button>
        </div>

        <div style={{ marginTop: '1rem', width: '100%' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => handleVerify(pinInput)}
            disabled={pinInput.length < 4}
          >
            <Unlock size={16} /> Sblocca DailyBudget
          </button>
        </div>

        <div className="pin-footer-hint">
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
            Il PIN è memorizzato esclusivamente nel browser locale di questo dispositivo.
          </p>
        </div>
      </div>
    </div>
  );
};

// =========================================================
// 2. SECURITY & PIN SETTINGS PANEL
// =========================================================

interface SecuritySettingsProps {
  isPinEnabled: boolean;
  onPinStateChange: (enabled: boolean) => void;
  onLockNow: () => void;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({
  isPinEnabled,
  onPinStateChange,
  onLockNow,
}) => {
  const currentPin = getStoredPin();

  // Create PIN state (when no PIN exists)
  const [createPin, setCreatePin] = useState('');
  const [createPinConfirm, setCreatePinConfirm] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Change PIN state
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);

  // Remove PIN state
  const [removeConfirmPin, setRemoveConfirmPin] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleCreatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const pin = createPin.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setCreateError('Il PIN deve essere composto da un numero di cifre compreso tra 4 e 8.');
      return;
    }
    if (pin !== createPinConfirm.trim()) {
      setCreateError('I due campi del PIN non corrispondono.');
      return;
    }

    setPinProtection(pin);
    onPinStateChange(true);
    setCreatePin('');
    setCreatePinConfirm('');
    setCreateSuccess('Protezione con PIN attivata con successo! Verrà richiesto al prossimo avvio.');
    setTimeout(() => setCreateSuccess(null), 4000);
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);
    setChangeSuccess(null);

    if (oldPin !== currentPin) {
      setChangeError('Il PIN attuale inserito non è corretto.');
      return;
    }
    if (!/^\d{4,8}$/.test(newPin.trim())) {
      setChangeError('Il nuovo PIN deve contenere da 4 a 8 cifre numeriche.');
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      setChangeError('I due campi del nuovo PIN non corrispondono.');
      return;
    }

    const updated = newPin.trim();
    setPinProtection(updated);
    onPinStateChange(true);
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setChangeSuccess('PIN modificato con successo!');
    setTimeout(() => setChangeSuccess(null), 4000);
  };

  const handleRemovePin = () => {
    setRemoveError(null);
    setRemoveSuccess(null);

    if (removeConfirmPin !== currentPin) {
      setRemoveError('Inserisci il PIN attuale corretto per rimuovere la protezione.');
      return;
    }

    removePinProtection();
    onPinStateChange(false);
    setShowRemoveConfirm(false);
    setRemoveConfirmPin('');
    setRemoveSuccess('Protezione PIN rimossa con successo. La WebApp si aprirà senza PIN.');
    setTimeout(() => setRemoveSuccess(null), 4000);
  };

  return (
    <div className="settings-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Overview Card */}
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <ShieldCheck size={18} style={{ color: 'var(--accent-primary)' }} />
            Sicurezza &amp; Protezione Accesso
          </div>
          <span
            className={`status-pill ${
              isPinEnabled ? 'status-safe' : 'status-warning'
            }`}
          >
            {isPinEnabled ? 'PIN Attivo' : 'Nessun PIN (Disattivato)'}
          </span>
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          La protezione con codice PIN è facoltativa e opera al 100% in locale sul tuo browser.
          Se abilitata, impedisce l'accesso ai tuoi dati contabili all'apertura dell'applicazione,
          ideale se utilizzi DailyBudget da browser mobile o condividi il dispositivo.
        </p>

        {createSuccess && (
          <div className="banner-notice" style={{ marginBottom: '1rem', color: 'var(--status-safe)' }}>
            <CheckCircle2 size={16} />
            <span>{createSuccess}</span>
          </div>
        )}
        {removeSuccess && (
          <div className="banner-notice" style={{ marginBottom: '1rem', color: 'var(--status-safe)' }}>
            <CheckCircle2 size={16} />
            <span>{removeSuccess}</span>
          </div>
        )}
      </section>

      {/* Case 1: No PIN configured yet -> Show Setup Form */}
      {!isPinEnabled && (
        <section className="card">
          <div className="card-header">
            <div className="card-title">
              <KeyRound size={18} style={{ color: 'var(--accent-primary)' }} />
              Imposta un Codice PIN di Blocco
            </div>
          </div>

          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Nessun PIN è attualmente configurato. Puoi sceglierne uno composto da 4 a 8 cifre numeriche.
          </p>

          <form onSubmit={handleCreatePin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {createError && (
              <div
                style={{
                  backgroundColor: 'var(--status-danger-bg)',
                  color: 'var(--status-danger)',
                  padding: '0.6rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{createError}</span>
              </div>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="setup-new-pin">Nuovo PIN (4-8 cifre)</label>
                <input
                  id="setup-new-pin"
                  type="password"
                  className="input mono-num"
                  placeholder="Es. 4 o 6 cifre"
                  maxLength={8}
                  value={createPin}
                  onChange={(e) => setCreatePin(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="setup-confirm-pin">Conferma Nuovo PIN</label>
                <input
                  id="setup-confirm-pin"
                  type="password"
                  className="input mono-num"
                  placeholder="Ripeti il PIN"
                  maxLength={8}
                  value={createPinConfirm}
                  onChange={(e) => setCreatePinConfirm(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">
                <Lock size={15} /> Attiva Protezione PIN
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Case 2: PIN already enabled -> Show Change Form & Remove Button */}
      {isPinEnabled && (
        <>
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <KeyRound size={18} style={{ color: 'var(--accent-primary)' }} />
                Modifica Codice PIN
              </div>
            </div>

            <form onSubmit={handleUpdatePin} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {changeError && (
                <div
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={15} />
                  <span>{changeError}</span>
                </div>
              )}

              {changeSuccess && (
                <div
                  style={{
                    backgroundColor: 'var(--status-safe-bg)',
                    color: 'var(--status-safe)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Check size={15} />
                  <span>{changeSuccess}</span>
                </div>
              )}

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="change-pin-old">PIN Attuale</label>
                  <input
                    id="change-pin-old"
                    type="password"
                    className="input mono-num"
                    placeholder="PIN in uso"
                    maxLength={8}
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="change-pin-new">Nuovo PIN (4-8 cifre)</label>
                  <input
                    id="change-pin-new"
                    type="password"
                    className="input mono-num"
                    placeholder="Nuovo codice"
                    maxLength={8}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="change-pin-confirm">Conferma Nuovo PIN</label>
                  <input
                    id="change-pin-confirm"
                    type="password"
                    className="input mono-num"
                    placeholder="Ripeti nuovo codice"
                    maxLength={8}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary">
                  <Check size={15} /> Salva Nuovo PIN
                </button>
              </div>
            </form>
          </section>

          {/* Remove / Disable PIN */}
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <Trash2 size={18} style={{ color: 'var(--status-danger)' }} />
                Rimuovi Protezione PIN
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  Disattiva e cancella il PIN
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  L'applicazione si aprirà direttamente senza richiedere codici di sblocco.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setShowRemoveConfirm((v) => !v)}
              >
                Rimuovi PIN
              </button>
            </div>

            {showRemoveConfirm && (
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <label
                  htmlFor="remove-confirm-pin"
                  style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}
                >
                  Inserisci il PIN attuale per confermare la rimozione definitiva:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '340px' }}>
                  <input
                    id="remove-confirm-pin"
                    type="password"
                    className="input mono-num"
                    placeholder="PIN attuale"
                    maxLength={8}
                    value={removeConfirmPin}
                    onChange={(e) => setRemoveConfirmPin(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleRemovePin}
                  >
                    Conferma Rimozione
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setShowRemoveConfirm(false);
                      setRemoveError(null);
                    }}
                  >
                    Annulla
                  </button>
                </div>
                {removeError && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertCircle size={14} /> {removeError}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Lock session now */}
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <Lock size={18} style={{ color: 'var(--accent-primary)' }} />
                Blocco Sessione Immediato
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  Blocca Schermata Adesso
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Torna alla schermata di sblocco PIN per proteggere la sessione in corso.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={onLockNow}
              >
                <Lock size={14} /> Blocca Ora
              </button>
            </div>
          </section>
        </>
      )}

      {/* Privacy & Storage Explainer */}
      <section className="card" style={{ opacity: 0.9 }}>
        <div className="card-header">
          <div className="card-title" style={{ fontSize: '0.88rem' }}>
            <Shield size={16} /> Privacy &amp; Archiviazione Locale
          </div>
        </div>
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li>
            <strong>100% Locale:</strong> Il PIN e i dati finanziari sono memorizzati unicamente nel <code>localStorage</code> del browser del tuo dispositivo.
          </li>
          <li>
            <strong>Zero Server:</strong> Nessun dato, password o file viene inviato a server esterni né a GitHub.
          </li>
          <li>
            <strong>Flessibile:</strong> Puoi impostare, modificare o rimuovere il PIN in qualsiasi momento.
          </li>
        </ul>
      </section>
    </div>
  );
};
