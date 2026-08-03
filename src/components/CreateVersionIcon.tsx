interface CreateVersionIconProps {
  size?: number;
}

export default function CreateVersionIcon({ size = 18 }: CreateVersionIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M8 4h9a2 2 0 0 1 2 2v10M6 7h8a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM10.5 11v5M8 13.5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
