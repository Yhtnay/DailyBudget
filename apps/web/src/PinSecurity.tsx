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
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Unlock,
} from 'lucide-react';

export const DEFAULT_PIN = '150116';
export const PIN_STORAGE_KEY = 'dailybudget_beta_pin_code';
export const PIN_ENABLED_KEY = 'dailybudget_beta_pin_enabled';
export const PIN_SESSION_KEY = 'dailybudget_beta_unlocked';

export function getStoredPin(): string {
  if (typeof window === 'undefined') return DEFAULT_PIN;
  const pin = localStorage.getItem(PIN_STORAGE_KEY);
  return pin && pin.trim().length >= 4 ? pin.trim() : DEFAULT_PIN;
}

export function isPinProtectionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(PIN_ENABLED_KEY);
  if (val === null) return true; // Default attivo con 150116
  return val === 'true';
}

export function isSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return true;
  if (!isPinProtectionEnabled()) return true;
  return sessionStorage.getItem(PIN_SESSION_KEY) === 'true';
}

export function setPinProtectionEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PIN_ENABLED_KEY, enabled ? 'true' : 'false');
  if (!enabled) {
    sessionStorage.setItem(PIN_SESSION_KEY, 'true');
  }
}

export function setStoredPin(newPin: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PIN_STORAGE_KEY, newPin.trim());
}

export function resetPinToDefault(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PIN_STORAGE_KEY, DEFAULT_PIN);
  localStorage.setItem(PIN_ENABLED_KEY, 'true');
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

  const currentPin = getStoredPin();
  const maxDigits = Math.max(6, currentPin.length);

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
      if (codeToTest === targetPin) {
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
      if (pinInput.length >= maxDigits) return;
      setErrorMsg(null);
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === currentPin.length) {
        handleVerify(next);
      }
    },
    [pinInput, maxDigits, currentPin.length, handleVerify]
  );

  const handleDelete = useCallback(() => {
    setErrorMsg(null);
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMsg(null);
    setPinInput('');
  }, []);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === 'Enter') {
        if (pinInput.length > 0) {
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
          <div className="pin-beta-pill">ACCESSO PROTETTO • BETA</div>
          <p className="pin-card-subtitle">
            Inserisci il codice PIN per accedere all'applicazione sul dispositivo.
          </p>
        </div>

        {/* Display Dots / Digits */}
        <div className="pin-display-cluster">
          <div className="pin-dots-container">
            {Array.from({ length: currentPin.length }).map((_, idx) => {
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

        {/* Action Button for confirmation if length < currentPin */}
        <div style={{ marginTop: '1rem', width: '100%' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => handleVerify(pinInput)}
            disabled={pinInput.length === 0}
          >
            <Unlock size={16} /> Sblocca DailyBudget
          </button>
        </div>

        <div className="pin-footer-hint">
          <p>
            PIN predefinito di fabbrica:{' '}
            <strong className="mono-num">150116</strong>
          </p>
          <p style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Puoi modificare o disattivare il PIN nel menu <em>Impostazioni</em>.
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
  onPinStateChange: (enabled: boolean, newPin?: string) => void;
  onLockNow: () => void;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({
  isPinEnabled,
  onPinStateChange,
  onLockNow,
}) => {
  const currentPin = getStoredPin();

  // Change PIN form state
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);

  // Toggle PIN protection state
  const [toggleConfirmPin, setToggleConfirmPin] = useState('');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggleSuccess, setToggleSuccess] = useState<string | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // Reset to default feedback
  const [resetNotice, setResetNotice] = useState<string | null>(null);

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
    setStoredPin(updated);
    onPinStateChange(true, updated);
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setChangeSuccess('PIN modificato con successo! Il nuovo PIN è attivo.');
    setTimeout(() => setChangeSuccess(null), 4000);
  };

  const handleToggleProtection = () => {
    setToggleError(null);
    setToggleSuccess(null);

    if (isPinEnabled) {
      // Disabling requires current PIN verification
      if (toggleConfirmPin !== currentPin) {
        setToggleError('Inserisci il PIN attuale corretto per disattivare la protezione.');
        return;
      }
      setPinProtectionEnabled(false);
      onPinStateChange(false);
      setShowDisableConfirm(false);
      setToggleConfirmPin('');
      setToggleSuccess('Protezione con PIN disattivata. La WebApp si aprirà senza PIN.');
    } else {
      // Enabling
      setPinProtectionEnabled(true);
      onPinStateChange(true);
      setToggleSuccess('Protezione con PIN attivata con successo.');
    }
    setTimeout(() => setToggleSuccess(null), 4000);
  };

  const handleResetDefault = () => {
    if (
      window.confirm(
        'Vuoi reimpostare il PIN di default (150116) e riabilitare la protezione all\'avvio?'
      )
    ) {
      resetPinToDefault();
      onPinStateChange(true, DEFAULT_PIN);
      setResetNotice('PIN ripristinato a 150116 e protezione attivata.');
      setTimeout(() => setResetNotice(null), 4000);
    }
  };

  return (
    <div className="settings-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Overview Card */}
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <ShieldCheck size={18} style={{ color: 'var(--accent-primary)' }} />
            Sicurezza &amp; Protezione Accesso (Beta Gatekeeper)
          </div>
          <span
            className={`status-pill ${
              isPinEnabled ? 'status-safe' : 'status-warning'
            }`}
          >
            {isPinEnabled ? 'PIN Attivo' : 'PIN Disattivato'}
          </span>
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          La protezione con codice PIN tutela la tua privacy durante la fase di beta testing,
          impedendo l'accesso non autorizzato ai tuoi dati finanziari sia quando apri l'app
          tramite GitHub Pages, sia sul browser del tuo smartphone.
        </p>

        {toggleSuccess && (
          <div className="banner-notice" style={{ marginBottom: '1rem', color: 'var(--status-safe)' }}>
            <CheckCircle2 size={16} />
            <span>{toggleSuccess}</span>
          </div>
        )}
        {resetNotice && (
          <div className="banner-notice" style={{ marginBottom: '1rem', color: 'var(--status-safe)' }}>
            <CheckCircle2 size={16} />
            <span>{resetNotice}</span>
          </div>
        )}

        {/* Toggle Enable / Disable */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Richiedi PIN all'avvio dell'applicazione
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isPinEnabled
                  ? 'Il PIN viene richiesto all\'apertura della pagina sul dispositivo.'
                  : 'La WebApp si apre immediatamente senza richiesta di sblocco.'}
              </div>
            </div>

            {isPinEnabled ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setShowDisableConfirm((v) => !v)}
              >
                <Lock size={14} /> Disattiva PIN
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleToggleProtection}
              >
                <Unlock size={14} /> Attiva PIN
              </button>
            )}
          </div>

          {showDisableConfirm && isPinEnabled && (
            <div
              style={{
                marginTop: '0.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <label
                htmlFor="toggle-confirm-pin"
                style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                Inserisci il PIN attuale per confermare la disattivazione:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '340px' }}>
                <input
                  id="toggle-confirm-pin"
                  type="password"
                  className="input mono-num"
                  placeholder="PIN attuale"
                  maxLength={8}
                  value={toggleConfirmPin}
                  onChange={(e) => setToggleConfirmPin(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleToggleProtection}
                >
                  Conferma
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowDisableConfirm(false);
                    setToggleError(null);
                  }}
                >
                  Annulla
                </button>
              </div>
              {toggleError && (
                <div style={{ fontSize: '0.78rem', color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertCircle size={14} /> {toggleError}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Change PIN Form */}
      {isPinEnabled && (
        <section className="card">
          <div className="card-header">
            <div className="card-title">
              <KeyRound size={18} style={{ color: 'var(--accent-primary)' }} />
              Modifica Codice PIN
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetDefault}
              title="Ripristina 150116"
            >
              <RotateCcw size={13} /> Reimposta default (150116)
            </button>
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
                  placeholder="es. 150116"
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">
                <Check size={15} /> Salva Nuovo PIN
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Immediate Lock & Session Actions */}
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Lock size={18} style={{ color: 'var(--accent-primary)' }} />
            Test e Blocco Sessione
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
              Blocca Schermata Adesso
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Torna alla schermata di inserimento PIN per verificare il funzionamento.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLockNow}
            disabled={!isPinEnabled}
          >
            <Lock size={14} /> Blocca Ora
          </button>
        </div>
      </section>

      {/* Privacy & Storage Explainer */}
      <section className="card" style={{ opacity: 0.9 }}>
        <div className="card-header">
          <div className="card-title" style={{ fontSize: '0.88rem' }}>
            <Shield size={16} /> Privacy &amp; Archiviazione Locale
          </div>
        </div>
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li>
            <strong>100% Locale:</strong> Il PIN e le preferenze di sicurezza sono memorizzati unicamente nel <code>localStorage</code> del browser del tuo telefono/computer.
          </li>
          <li>
            <strong>Nessun Server:</strong> Nessun PIN, transazione o informazione finanziaria viene mai inviata a server esterni o a GitHub.
          </li>
          <li>
            <strong>Disattivabile:</strong> Quando avrai completato la fase beta o vorrai accedere direttamente, puoi rimuovere il PIN con un clic da questo pannello.
          </li>
        </ul>
      </section>
    </div>
  );
};
