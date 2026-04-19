interface TrashIconProps {
  size?: number;
}

export default function TrashIcon({ size = 18 }: TrashIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7.5 0 .7 10.2A2 2 0 0 0 10.2 19h3.6a2 2 0 0 0 2-1.8L16.5 7M10 10.5v5M14 10.5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
