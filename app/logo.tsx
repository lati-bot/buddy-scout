export default function Logo({ size = 40 }: { size?: number }) {
  // "Link" mark — two nodes joined by a bond. The picked brand direction
  // (see DESIGN.md / logo-options): a person-to-person intro, which is
  // literally what the warm path does. Mirrors public/logo-mark.svg.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Buddy Scout"
      style={{ display: "block", flexShrink: 0 }}
    >
      <g fill="currentColor">
        <circle cx="17" cy="32" r="13" />
        <circle cx="47" cy="32" r="13" />
        <rect x="17" y="26" width="30" height="12" />
      </g>
    </svg>
  );
}
