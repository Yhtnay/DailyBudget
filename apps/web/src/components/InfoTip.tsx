import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

export interface InfoTipProps {
  title?: string;
  text: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}

export const InfoTip: React.FC<InfoTipProps> = ({
  title,
  text,
  ariaLabel,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const close = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
  };

  return (
    <span ref={containerRef} className={`infotip-wrapper ${className}`}>
      <button
        type="button"
        className={`infotip-btn ${isOpen ? 'active' : ''}`}
        onClick={toggle}
        aria-label={ariaLabel || title || 'Maggiori informazioni'}
        aria-expanded={isOpen}
      >
        <Info size={15} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="infotip-popover" role="dialog" aria-modal="false">
          <div className="infotip-header">
            {title && <h5 className="infotip-title">{title}</h5>}
            <button
              type="button"
              className="infotip-close-btn"
              onClick={close}
              aria-label="Chiudi spiegazione"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="infotip-body">{text}</div>
        </div>
      )}
    </span>
  );
};
