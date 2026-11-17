import type { CSSProperties } from 'react';

export interface ChatBackgroundPreset {
  id: string;
  name: string;
  description: string;
  previewStyle: CSSProperties;
  darkStyle: CSSProperties;
  lightStyle: CSSProperties;
}

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  {
    id: 'default',
    name: 'الافتراضي (Q)',
    description: 'خلفية Q القياسية المتكيفة مع السمة',
    previewStyle: {
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
    },
    darkStyle: {
      backgroundColor: '#0B0F19',
    },
    lightStyle: {
      backgroundColor: '#F8FAFC',
    },
  },
  {
    id: 'midnight_cosmos',
    name: 'ليل القمر',
    description: 'تدرج ليلي عميق مع هالة زرقاء هادئة',
    previewStyle: {
      background:
        'radial-gradient(circle at 20% 20%, rgba(59,109,255,0.32), transparent 55%), linear-gradient(160deg, #070B14 0%, #0E1729 100%)',
    },
    darkStyle: {
      backgroundColor: '#070B14',
      backgroundImage:
        'radial-gradient(circle at 20% 15%, rgba(59,109,255,0.22), transparent 52%), radial-gradient(circle at 80% 85%, rgba(56,189,248,0.14), transparent 50%), linear-gradient(165deg, #070B14 0%, #0E1729 100%)',
    },
    lightStyle: {
      backgroundColor: '#EFF4FF',
      backgroundImage:
        'radial-gradient(circle at 20% 15%, rgba(59,109,255,0.12), transparent 52%), linear-gradient(165deg, #F5F8FF 0%, #E7EEFF 100%)',
    },
  },
  {
    id: 'obsidian_gold',
    name: 'أوبسيديان ذهبي',
    description: 'سطح داكن فخم بلمسات ذهبية خافتة',
    previewStyle: {
      background:
        'radial-gradient(circle at 80% 20%, rgba(212,175,55,0.28), transparent 55%), linear-gradient(160deg, #0B0D12 0%, #171923 100%)',
    },
    darkStyle: {
      backgroundColor: '#0B0D12',
      backgroundImage:
        'radial-gradient(circle at 82% 18%, rgba(212,175,55,0.16), transparent 48%), radial-gradient(circle at 18% 82%, rgba(180,140,40,0.10), transparent 50%), linear-gradient(165deg, #0B0D12 0%, #151822 100%)',
    },
    lightStyle: {
      backgroundColor: '#FBF9F2',
      backgroundImage:
        'radial-gradient(circle at 82% 18%, rgba(212,175,55,0.14), transparent 50%), linear-gradient(165deg, #FCFBF6 0%, #F4EFE0 100%)',
    },
  },
  {
    id: 'emerald_mist',
    name: 'ضباب زمردي',
    description: 'نغمة زمردية مريحة للقراءة الطويلة',
    previewStyle: {
      background:
        'radial-gradient(circle at 25% 25%, rgba(16,185,129,0.26), transparent 55%), linear-gradient(160deg, #081513 0%, #0F2320 100%)',
    },
    darkStyle: {
      backgroundColor: '#081513',
      backgroundImage:
        'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.16), transparent 50%), radial-gradient(circle at 85% 80%, rgba(20,184,166,0.12), transparent 50%), linear-gradient(165deg, #081513 0%, #0E1F1C 100%)',
    },
    lightStyle: {
      backgroundColor: '#EEF9F5',
      backgroundImage:
        'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.12), transparent 52%), linear-gradient(165deg, #F3FBF8 0%, #E5F4EE 100%)',
    },
  },
  {
    id: 'aurora_slate',
    name: 'شفق سحابي',
    description: 'تدرج أردوازي وبنفسجي هادئ للغرف الإبداعية',
    previewStyle: {
      background:
        'radial-gradient(circle at 75% 25%, rgba(139,92,246,0.28), transparent 55%), linear-gradient(160deg, #0F0D1A 0%, #1A172B 100%)',
    },
    darkStyle: {
      backgroundColor: '#0F0D1A',
      backgroundImage:
        'radial-gradient(circle at 78% 18%, rgba(139,92,246,0.18), transparent 52%), radial-gradient(circle at 18% 85%, rgba(59,109,255,0.14), transparent 52%), linear-gradient(165deg, #0F0D1A 0%, #181629 100%)',
    },
    lightStyle: {
      backgroundColor: '#F5F3FF',
      backgroundImage:
        'radial-gradient(circle at 78% 18%, rgba(139,92,246,0.12), transparent 52%), linear-gradient(165deg, #F8F7FF 0%, #EDE9FE 100%)',
    },
  },
  {
    id: 'desert_dusk',
    name: 'غسق دافئ',
    description: 'ألوان غروب دافئة ومريحة للعين',
    previewStyle: {
      background:
        'radial-gradient(circle at 25% 20%, rgba(244,63,94,0.22), transparent 55%), linear-gradient(160deg, #171016 0%, #24171D 100%)',
    },
    darkStyle: {
      backgroundColor: '#171016',
      backgroundImage:
        'radial-gradient(circle at 22% 18%, rgba(244,63,94,0.16), transparent 50%), radial-gradient(circle at 80% 82%, rgba(245,158,11,0.10), transparent 50%), linear-gradient(165deg, #171016 0%, #21151B 100%)',
    },
    lightStyle: {
      backgroundColor: '#FFF5F6',
      backgroundImage:
        'radial-gradient(circle at 22% 18%, rgba(244,63,94,0.10), transparent 52%), linear-gradient(165deg, #FFF8F8 0%, #FCECEE 100%)',
    },
  },
  {
    id: 'geometric_mesh',
    name: 'شبكة هندسية',
    description: 'نمط شبكي دقيق يوحي بتنظيم الدردشة',
    previewStyle: {
      backgroundColor: '#0D1320',
      backgroundImage:
        'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
      backgroundSize: '20px 20px',
    },
    darkStyle: {
      backgroundColor: '#0C111C',
      backgroundImage:
        'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
      backgroundSize: '26px 26px',
    },
    lightStyle: {
      backgroundColor: '#F6F8FB',
      backgroundImage:
        'linear-gradient(rgba(15,23,42,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.045) 1px, transparent 1px)',
      backgroundSize: '26px 26px',
    },
  },
];

export function resolveChatBackgroundStyle(params: {
  presetId?: string;
  bgColor?: string;
  bgImageURL?: string;
  resolvedTheme?: 'light' | 'dark';
}): { style: CSSProperties; hasCustomImage: boolean } {
  const { presetId, bgColor, bgImageURL, resolvedTheme = 'dark' } = params;
  if (bgImageURL && bgImageURL.trim()) {
    return {
      hasCustomImage: true,
      style: {
        backgroundImage: `url(${bgImageURL.trim()})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }
  if (bgColor && bgColor.trim()) {
    return {
      hasCustomImage: false,
      style: {
        backgroundColor: bgColor.trim(),
      },
    };
  }
  const preset = CHAT_BACKGROUND_PRESETS.find((p) => p.id === presetId) || CHAT_BACKGROUND_PRESETS[0];
  return {
    hasCustomImage: false,
    style: resolvedTheme === 'light' ? preset.lightStyle : preset.darkStyle,
  };
}
