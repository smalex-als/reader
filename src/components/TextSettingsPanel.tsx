import type { AppSettings } from '@/types/app';

interface TextSettingsPanelProps {
  id: string;
  className?: string;
  controlPrefix: string;
  textFontSize: number;
  onTextFontSizeChange: (value: number) => void;
  textTheme: AppSettings['textTheme'];
  onTextThemeChange: (value: string) => void;
}

const FONT_SIZE_OPTIONS = [
  { label: 'Compact', value: 18 },
  { label: 'Easy', value: 20 },
  { label: 'Comfortable', value: 24 },
  { label: 'Spacious', value: 26 },
  { label: 'Grand', value: 28 },
  { label: 'Theater', value: 30 },
  { label: 'Cinema', value: 34 }
];

const COLOR_OPTIONS: { label: string; value: AppSettings['textTheme'] }[] = [
  { label: 'Night', value: 'dark' },
  { label: 'Dracula', value: 'dracula' },
  { label: 'Obsidian', value: 'obsidian' },
  { label: 'Nord', value: 'nord' },
  { label: 'Gruvbox', value: 'gruvbox' },
  { label: 'Solarized', value: 'solarized' },
  { label: 'White', value: 'light' },
  { label: 'Warm', value: 'warm' }
];

export default function TextSettingsPanel({
  id,
  className,
  controlPrefix,
  textFontSize,
  onTextFontSizeChange,
  textTheme,
  onTextThemeChange
}: TextSettingsPanelProps) {
  const panelClassName = ['text-viewer-settings', className].filter(Boolean).join(' ');
  const fontSizeName = `${controlPrefix}-font-size`;
  const colorSchemeName = `${controlPrefix}-color-scheme`;

  return (
    <div className={panelClassName} id={id}>
      <div className="text-viewer-setting">
        <span className="text-viewer-setting-label">Font size</span>
        <div className="text-viewer-radio-group" role="radiogroup" aria-label="Text size">
          {FONT_SIZE_OPTIONS.map((option) => {
            const inputId = `${fontSizeName}-${option.value}`;
            return (
              <label key={option.value} className="text-viewer-radio" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="radio"
                  name={fontSizeName}
                  value={option.value}
                  checked={textFontSize === option.value}
                  onChange={() => onTextFontSizeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="text-viewer-setting">
        <span className="text-viewer-setting-label">Color scheme</span>
        <div className="text-viewer-radio-group" role="radiogroup" aria-label="Color scheme">
          {COLOR_OPTIONS.map((option) => {
            const inputId = `${colorSchemeName}-${option.value}`;
            return (
              <label key={option.value} className="text-viewer-radio" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="radio"
                  name={colorSchemeName}
                  value={option.value}
                  checked={textTheme === option.value}
                  onChange={() => onTextThemeChange(option.value)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
