import React from 'react';

export interface DailyBudgetAppIconProps {
  size?: number | string;
  className?: string;
  title?: string;
}

export function DailyBudgetAppIcon({
  size = 34,
  className = '',
  title = 'DailyBudget',
}: DailyBudgetAppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-label={title}
      role="img"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="db-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#042020" />
          <stop offset="45%" stopColor="#0d5952" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>

        <radialGradient id="db-glow" cx="35%" cy="25%" r="65%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="db-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="30%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>

        <linearGradient id="db-vault-white" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0fdfa" />
        </linearGradient>
      </defs>

      <rect x="24" y="24" width="464" height="464" rx="116" ry="116" fill="url(#db-bg-grad)" />
      <rect x="24" y="24" width="464" height="464" rx="116" ry="116" fill="url(#db-glow)" />
      <rect
        x="26"
        y="26"
        width="460"
        height="460"
        rx="114"
        ry="114"
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="2.5"
        strokeOpacity="0.4"
      />

      <g transform="translate(16, 8)">
        <path
          d="M 148 132 C 148 120 158 110 170 110 L 260 110 C 322 110 366 146 366 200 C 366 234 346 260 316 272 C 354 286 378 318 378 358 C 378 412 334 418 274 418 L 170 418 C 158 418 148 408 148 396 Z"
          fill="#011514"
          opacity="0.32"
          transform="translate(0, 10)"
        />

        <rect x="148" y="118" width="56" height="280" rx="18" fill="url(#db-vault-white)" />

        <path
          d="M 194 118 L 264 118 C 320 118 358 148 358 198 C 358 248 320 270 264 270 L 194 270 Z"
          fill="none"
          stroke="url(#db-vault-white)"
          strokeWidth="38"
          strokeLinejoin="round"
        />

        <path
          d="M 194 242 L 272 242 C 334 242 370 274 370 328 C 370 382 334 398 272 398 L 194 398 Z"
          fill="none"
          stroke="url(#db-vault-white)"
          strokeWidth="38"
          strokeLinejoin="round"
        />

        <rect x="148" y="240" width="70" height="34" rx="8" fill="url(#db-vault-white)" />

        <g transform="translate(338, 256)">
          <circle cx="0" cy="0" r="64" fill="#facc15" opacity="0.18" />
          <circle cx="0" cy="0" r="50" fill="#facc15" opacity="0.28" />

          <circle cx="0" cy="0" r="42" fill="url(#db-gold-grad)" />
          <circle cx="0" cy="0" r="42" fill="none" stroke="#fef9c3" strokeWidth="3" />
          <circle cx="0" cy="0" r="33" fill="#eab308" />

          <path
            d="M 0 -20 C 0 -6 6 0 20 0 C 6 0 0 6 0 20 C 0 6 -6 0 -20 0 C -6 0 0 -6 0 -20 Z"
            fill="#ffffff"
          />

          <circle cx="0" cy="0" r="3.5" fill="#b45309" />
        </g>
      </g>
    </svg>
  );
}
