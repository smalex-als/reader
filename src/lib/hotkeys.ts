export const ZOOM_STEP = 0.15;
export const PAN_STEP = 40;
export const PAN_PAGE_STEP = 1000;

export const HOTKEYS = [
  { keys: 'Arrow keys', action: 'Pan image' },
  { keys: 'PageUp', action: 'Previous page' },
  { keys: 'K', action: 'Previous page' },
  { keys: 'PageDown', action: 'Next page' },
  { keys: 'J', action: 'Next page' },
  { keys: 'Space', action: 'Pan up' },
  { keys: 'Shift + Space', action: 'Pan down' },
  { keys: '+ / =', action: 'Zoom in' },
  { keys: '-', action: 'Zoom out' },
  { keys: '0', action: 'Open listening dashboard' },
  { keys: 'W', action: 'Fit width' },
  { keys: 'H', action: 'Fit height' },
  { keys: 'R', action: 'Rotate 90°' },
  { keys: 'I', action: 'Invert colors' },
  { keys: 'T', action: 'Toggle page text' },
  { keys: 'O', action: 'Run Deepseek OCR in background' },
  { keys: 'E', action: 'Toggle OCR block edit mode' },
  { keys: '1', action: 'Switch to page view' },
  { keys: '2', action: 'Switch to scroll view' },
  { keys: '3', action: 'Switch to text view' },
  { keys: '7', action: 'Open quiz' },
  { keys: '8', action: 'Open vocabulary' },
  { keys: 'S', action: 'Play/Stop stream audio' },
  { keys: 'P', action: 'Pause/Resume stream audio' },
  { keys: 'N', action: 'Next study block' },
  { keys: 'G', action: 'Focus Go To input' },
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'C', action: 'Open TOC' },
  { keys: 'B', action: 'Open book selector' },
  { keys: ',', action: 'Open settings' },
  { keys: '/', action: 'Open search' },
  { keys: 'Esc', action: 'Close dialogs' },
  { keys: 'Shift + /', action: 'Open help' }
];
