import { Select } from './ui';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { SUPPORTED_LANGS, setLang } from '../i18n';

export function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();
  return (
    <Select
      value={mode}
      onValueChange={(v) => setMode(v as ThemeMode)}
      size="sm"
      options={[
        { value: 'system', label: t('theme.system') },
        { value: 'light', label: t('theme.light') },
        { value: 'dark', label: t('theme.dark') },
      ]}
    />
  );
}

export function LangSwitch() {
  const { i18n } = useTranslation();
  return (
    <Select
      value={i18n.language}
      onValueChange={(v) => setLang(v)}
      size="sm"
      options={SUPPORTED_LANGS.map((l) => ({ value: l.code, label: l.label }))}
    />
  );
}
