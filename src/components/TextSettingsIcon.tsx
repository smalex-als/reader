interface TextSettingsIconProps {
  size?: number;
}

export default function TextSettingsIcon({ size = 18 }: TextSettingsIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M4 7h6M14 7h6M4 17h10M18 17h2M10 4v6M14 14v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
