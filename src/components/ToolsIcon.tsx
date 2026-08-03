interface ToolsIconProps {
  size?: number;
}

export default function ToolsIcon({ size = 18 }: ToolsIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M14.4 6.2a4.1 4.1 0 0 0-5.1 5.1L4.8 15.8a2.1 2.1 0 1 0 3 3l4.5-4.5a4.1 4.1 0 0 0 5.1-5.1l-2.5 2.5-2.6-.7-.7-2.6 2.8-2.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
