export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Buddy Scout"
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle cx="48" cy="48" r="44" fill="#1a1a1a" />
      <circle
        cx="48"
        cy="48"
        r="34"
        fill="none"
        stroke="#faf8f3"
        strokeWidth="2"
        opacity="0.4"
      />
      <polygon points="48,20 56,48 48,44 40,48" fill="#c8492e" />
      <polygon points="48,76 40,48 48,52 56,48" fill="#faf8f3" />
      <circle cx="48" cy="48" r="4" fill="#faf8f3" />
    </svg>
  );
}
