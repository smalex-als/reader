import {
  appActions,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AppSettings } from '@/types/app';

interface TextSettingsPanelProps {
  id: string;
  className?: string;
  controlPrefix: string;
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

const TEXT_BRIGHTNESS_OPTIONS = [
  { label: 'Dimmer', value: 1 },
  { label: 'Dim', value: 2 },
  { label: 'Soft', value: 3 },
  { label: 'Balanced', value: 4 },
  { label: 'Clear', value: 5 },
  { label: 'Bright', value: 6 },
  { label: 'Max', value: 7 }
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
  controlPrefix
}: TextSettingsPanelProps) {
  const dispatch = useAppDispatch();
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { textBrightness, textFontSize, textTheme } = settings;
  const panelClassName = ['text-viewer-settings', className].filter(Boolean).join(' ');
  const fontSizeName = `${controlPrefix}-font-size`;
  const textBrightnessName = `${controlPrefix}-text-brightness`;
  const colorSchemeName = `${controlPrefix}-color-scheme`;
  const updateTextFontSize = (nextSize: number) => {
    if (textFontSize === nextSize) {
      return;
    }
    dispatch(appActions.setViewerSettings({ ...settings, textFontSize: nextSize }));
  };
  const updateTextTheme = (nextTheme: AppSettings['textTheme']) => {
    if (textTheme === nextTheme) {
      return;
    }
    dispatch(appActions.setViewerSettings({ ...settings, textTheme: nextTheme }));
  };
  const updateTextBrightness = (nextBrightness: number) => {
    if (textBrightness === nextBrightness) {
      return;
    }
    dispatch(appActions.setViewerSettings({ ...settings, textBrightness: nextBrightness }));
  };

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
                  onChange={() => updateTextFontSize(option.value)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="text-viewer-setting">
        <span className="text-viewer-setting-label">Text brightness</span>
        <div
          className="text-viewer-radio-group"
          role="radiogroup"
          aria-label="Text brightness"
        >
          {TEXT_BRIGHTNESS_OPTIONS.map((option) => {
            const inputId = `${textBrightnessName}-${option.value}`;
            return (
              <label key={option.value} className="text-viewer-radio" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="radio"
                  name={textBrightnessName}
                  value={option.value}
                  checked={textBrightness === option.value}
                  onChange={() => updateTextBrightness(option.value)}
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
                  onChange={() => updateTextTheme(option.value)}
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
