import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'electric-blue' | 'cyan' | 'amber' | 'emerald' | 'purple';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemeMode) => void;
  accentColor: AccentColor;
  setAccentColor: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const ACCENT_COLORS: Record<AccentColor, { primary: string; hover: string; glow: string }> = {
  'electric-blue': { primary: '#3B6DFF', hover: '#2B5BE5', glow: 'rgba(59, 109, 255, 0.4)' },
  'cyan': { primary: '#06B6D4', hover: '#0891B2', glow: 'rgba(6, 182, 212, 0.4)' },
  'amber': { primary: '#F59E0B', hover: '#D97706', glow: 'rgba(245, 158, 11, 0.4)' },
  'emerald': { primary: '#10B981', hover: '#059669', glow: 'rgba(16, 185, 129, 0.4)' },
  'purple': { primary: '#8B5CF6', hover: '#7C3AED', glow: 'rgba(139, 92, 246, 0.4)' },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('q_theme_mode') as ThemeMode) || 'dark';
  });

  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    return (localStorage.getItem('q_accent_color') as AccentColor) || 'electric-blue';
  });

  const [systemIsDark, setSystemIsDark] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const resolvedTheme: 'dark' | 'light' =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    // Apply accent color
    const config = ACCENT_COLORS[accentColor] || ACCENT_COLORS['electric-blue'];
    root.style.setProperty('--primary', config.primary);
    root.style.setProperty('--primary-hover', config.hover);
  }, [resolvedTheme, accentColor]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('q_theme_mode', newTheme);
  };

  const setAccentColor = (newAccent: AccentColor) => {
    setAccentColorState(newAccent);
    localStorage.setItem('q_accent_color', newAccent);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        accentColor,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
