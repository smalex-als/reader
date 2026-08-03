interface CreateChapterIconProps {
  size?: number;
}

export default function CreateChapterIcon({ size = 18 }: CreateChapterIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM14 3.5V8h4M11.5 11.5v6M8.5 14.5h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
