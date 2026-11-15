import React from 'react';

export const LotusLogo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M32 10C37.5 19.5 40 28 32 41C24 28 26.5 19.5 32 10Z"
      stroke="#D4AF37"
      strokeWidth="2.5"
      strokeLinejoin="round"
      fill="#D4AF37"
      fillOpacity="0.14"
    />
    <path
      d="M17.5 20C25 24 29.5 31 30 42.5C21 37.5 16.5 29.5 17.5 20Z"
      stroke="#D4AF37"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path
      d="M46.5 20C39 24 34.5 31 34 42.5C43 37.5 47.5 29.5 46.5 20Z"
      stroke="#D4AF37"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path
      d="M11 34C19.5 34.5 26 38 29 45.5C19.5 45 13 40.5 11 34Z"
      stroke="#7C3AED"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M53 34C44.5 34.5 38 38 35 45.5C44.5 45 51 40.5 53 34Z"
      stroke="#7C3AED"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <line x1="18" y1="51" x2="46" y2="51" stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="32" cy="29" r="2.5" fill="#E5C158" />
  </svg>
);
