interface Props {
  size?: number;
  label?: string;
  className?: string;
}

export default function LightningLoader({ size = 22, label, className = '' }: Props) {
  const id = `bolt-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="yomiru-bolt"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d="M13 2 L4 14 h6 l-2 8 L20 10 h-6 l1 -8 Z" />
          </clipPath>
          <linearGradient id={`${id}-grad`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#4A1A00" />
            <stop offset="100%" stopColor="#E95000" />
          </linearGradient>
        </defs>
        <path
          d="M13 2 L4 14 h6 l-2 8 L20 10 h-6 l1 -8 Z"
          fill="none"
          stroke="#E95000"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${id}-clip)`}>
          <rect
            x="0"
            width="24"
            fill={`url(#${id}-grad)`}
            className="yomiru-bolt-fill"
          />
        </g>
      </svg>
      {label ? <span className="text-zinc-400 text-xs font-medium">{label}</span> : null}
    </span>
  );
}
