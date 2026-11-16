import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Highlighter,
  Quote,
  List,
  ListOrdered,
  Code2,
  Link2,
  Minus,
  AlignCenter,
  Eye,
  PenLine,
  Info,
  Lightbulb,
  AlertTriangle,
  Copy,
  Check,
  ImagePlus,
  Loader2,
  Clock
} from 'lucide-react';
import { uploadMediaWithControl, validateMediaFile } from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { MediaImage } from './MediaImage';

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function estimateReadingMinutes(text: string): number {
  const cleaned = stripMarkdownForPreview(text);
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export function stripMarkdownForPreview(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^::center::\s*/gm, '')
    .replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*/gim, '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^(-{3,}|\*{3,})$/gm, ' ')
    .replace(/(\*\*|__|~~|==|`)/g, '')
    .replace(/(^|\s)\*([^\s*][^*]*?)\*(?=\s|$|[.,!؟،:])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderInlineNodes(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex =
    /(\*\*[^*]+\*\*|==[^=]+==|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*|#[\w\u0600-\u06FF_]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}_t_${idx++}`;

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      parts.push(
        <strong key={key} className="font-extrabold text-slate-950 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('==') && token.endsWith('==') && token.length > 4) {
      parts.push(
        <mark
          key={key}
          className="px-1.5 py-0.5 rounded-md bg-amber-300/40 dark:bg-amber-400/20 text-slate-900 dark:text-amber-200 font-semibold"
        >
          {token.slice(2, -2)}
        </mark>
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      parts.push(
        <code
          key={key}
          dir="ltr"
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-100 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-[0.88em] font-mono-subtle text-[#3B6DFF] dark:text-[#60A5FA]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitAt = token.indexOf('](');
      const label = token.slice(1, splitAt);
      const url = token.slice(splitAt + 2, -1);
      if (isSafeHttpUrl(url)) {
        parts.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[#3B6DFF] dark:text-[#60A5FA] font-semibold underline underline-offset-4 decoration-[#3B6DFF]/40 hover:decoration-[#3B6DFF] transition-colors"
          >
            {label}
          </a>
        );
      } else {
        parts.push(label);
      }
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      parts.push(
        <em key={key} className="italic text-slate-700 dark:text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('#')) {
      parts.push(
        <span key={key} className="text-[#3B6DFF] dark:text-[#60A5FA] font-semibold">
          {token}
        </span>
      );
    } else {
      parts.push(token);
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      dir="ltr"
      className="my-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A] bg-slate-900 dark:bg-[#070A12] text-slate-100 shadow-sm"
    >
      <div className="px-3.5 py-2 bg-slate-800/80 dark:bg-[#111623] border-b border-slate-700/60 dark:border-[#2A2F3A] flex items-center justify-between text-[11px] text-slate-300 font-mono-subtle">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 text-slate-200 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 text-xs leading-relaxed overflow-x-auto font-mono-subtle">
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface RichBlogContentProps {
  content: string;
  onImageClick?: (url: string) => void;
  compact?: boolean;
}

export function RichBlogContent({ content, onImageClick, compact = false }: RichBlogContentProps) {
  if (!content) return null;

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced Code Block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(<CodeBlock key={`b_${blockKey++}`} code={codeLines.join('\n')} lang={lang} />);
      continue;
    }

    // Horizontal Rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(
        <div key={`b_${blockKey++}`} className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200 dark:bg-[#2A2F3A]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B6DFF]/50" />
          <div className="flex-1 h-px bg-slate-200 dark:bg-[#2A2F3A]" />
        </div>
      );
      i += 1;
      continue;
    }

    // Standalone Image ![caption](url)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch && isSafeHttpUrl(imgMatch[2])) {
      const caption = imgMatch[1];
      const imgUrl = imgMatch[2];
      blocks.push(
        <figure
          key={`b_${blockKey++}`}
          className="my-3.5 rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3A] bg-slate-100 dark:bg-[#0B0F19]"
        >
          <MediaImage
            src={imgUrl}
            alt={caption || 'صورة توضيحية'}
            variant="post"
            onClick={(e) => {
              if (onImageClick) {
                e.stopPropagation();
                onImageClick(imgUrl);
              }
            }}
            containerClassName="w-full overflow-hidden"
            className={`w-full max-h-96 object-cover ${onImageClick ? 'cursor-pointer' : ''}`}
          />
          {caption && (
            <figcaption className="px-3.5 py-2 text-[11px] text-slate-500 dark:text-[#94A3B8] text-center border-t border-slate-200/70 dark:border-[#2A2F3A]">
              {caption}
            </figcaption>
          )}
        </figure>
      );
      i += 1;
      continue;
    }

    // Headings (#, ##, ###)
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const key = `b_${blockKey++}`;
      if (level === 1) {
        blocks.push(
          <h2
            key={key}
            className="text-lg sm:text-xl font-extrabold text-slate-950 dark:text-white mt-4 mb-2 leading-snug"
          >
            {renderInlineNodes(text, key)}
          </h2>
        );
      } else if (level === 2) {
        blocks.push(
          <h3
            key={key}
            className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-3.5 mb-1.5 leading-snug"
          >
            {renderInlineNodes(text, key)}
          </h3>
        );
      } else {
        blocks.push(
          <h4
            key={key}
            className="text-sm sm:text-base font-bold text-[#3B6DFF] dark:text-[#60A5FA] mt-3 mb-1 leading-snug"
          >
            {renderInlineNodes(text, key)}
          </h4>
        );
      }
      i += 1;
      continue;
    }

    // Centered paragraph ::center::
    if (trimmed.startsWith('::center::')) {
      const inner = trimmed.replace(/^::center::\s*/, '');
      const key = `b_${blockKey++}`;
      blocks.push(
        <p
          key={key}
          className="text-center text-sm sm:text-[15px] font-semibold text-slate-800 dark:text-slate-100 leading-relaxed my-2.5 px-2"
        >
          {renderInlineNodes(inner, key)}
        </p>
      );
      i += 1;
      continue;
    }

    // Callouts & Blockquotes (> [!NOTE] / > ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const firstLine = quoteLines[0] || '';
      const calloutMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*(.*)$/i);
      const key = `b_${blockKey++}`;

      if (calloutMatch) {
        const variant = calloutMatch[1].toUpperCase();
        const restLines = [calloutMatch[2], ...quoteLines.slice(1)].filter(Boolean);
        const styles =
          variant === 'TIP'
            ? {
                box: 'bg-emerald-500/8 dark:bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100',
                labelColor: 'text-emerald-600 dark:text-emerald-400',
                label: 'نصيحة عملية',
                icon: <Lightbulb className="w-4 h-4 shrink-0" />,
              }
            : variant === 'WARNING'
            ? {
                box: 'bg-amber-500/8 dark:bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100',
                labelColor: 'text-amber-600 dark:text-amber-400',
                label: 'تنبيه مهم',
                icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
              }
            : {
                box: 'bg-[#3B6DFF]/8 dark:bg-[#3B6DFF]/12 border-[#3B6DFF]/30 text-slate-900 dark:text-slate-100',
                labelColor: 'text-[#3B6DFF] dark:text-[#60A5FA]',
                label: variant === 'IMPORTANT' ? 'نقطة محورية' : 'ملاحظة',
                icon: <Info className="w-4 h-4 shrink-0" />,
              };

        blocks.push(
          <div key={key} className={`my-3 p-3.5 rounded-2xl border ${styles.box} space-y-1.5`}>
            <div className={`flex items-center gap-1.5 text-xs font-extrabold ${styles.labelColor}`}>
              {styles.icon}
              <span>{styles.label}</span>
            </div>
            <div className="text-xs sm:text-sm leading-relaxed space-y-1">
              {restLines.map((rl, rIdx) => (
                <p key={rIdx}>{renderInlineNodes(rl, `${key}_r${rIdx}`)}</p>
              ))}
            </div>
          </div>
        );
      } else {
        blocks.push(
          <blockquote
            key={key}
            className="my-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] text-slate-700 dark:text-slate-200 space-y-1"
          >
            <div className="flex items-start gap-2.5">
              <Quote className="w-4 h-4 text-[#3B6DFF] dark:text-[#60A5FA] shrink-0 mt-1 opacity-80" />
              <div className="text-sm italic leading-relaxed space-y-1 flex-1">
                {quoteLines.map((ql, qIdx) => (
                  <p key={qIdx}>{renderInlineNodes(ql, `${key}_q${qIdx}`)}</p>
                ))}
              </div>
            </div>
          </blockquote>
        );
      }
      continue;
    }

    // Unordered List (- / *)
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      const key = `b_${blockKey++}`;
      blocks.push(
        <ul key={key} className="my-2.5 space-y-1.5 ps-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B6DFF] dark:bg-[#60A5FA] mt-2 shrink-0" />
              <span className="flex-1">{renderInlineNodes(item, `${key}_u${idx}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List (1. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      const key = `b_${blockKey++}`;
      blocks.push(
        <ol key={key} className="my-2.5 space-y-1.5 ps-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
              <span className="min-w-[22px] h-[22px] rounded-lg bg-[#3B6DFF]/10 text-[#3B6DFF] dark:text-[#60A5FA] text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                {idx + 1}
              </span>
              <span className="flex-1">{renderInlineNodes(item, `${key}_o${idx}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (gather consecutive non-special lines)
    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        next.startsWith('```') ||
        next.startsWith('#') ||
        next.startsWith('>') ||
        next.startsWith('::center::') ||
        /^[-*+]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^(-{3,}|\*{3,})$/.test(next) ||
        /^!\[[^\]]*\]\([^)]+\)$/.test(next)
      ) {
        break;
      }
      paraLines.push(lines[i]);
      i += 1;
    }

    const key = `b_${blockKey++}`;
    blocks.push(
      <p
        key={key}
        className={`${
          compact ? 'text-xs sm:text-sm' : 'text-[14.5px] sm:text-[15.5px]'
        } text-slate-800 dark:text-slate-100 leading-[1.85] my-2 text-start break-words`}
      >
        {paraLines.map((pl, pIdx) => (
          <React.Fragment key={pIdx}>
            {pIdx > 0 && <br />}
            {renderInlineNodes(pl, `${key}_p${pIdx}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return <div className="space-y-1 font-tajawal">{blocks}</div>;
}

interface RichBlogEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  allowInlineImageUpload?: boolean;
}

export function RichBlogEditor({
  value,
  onChange,
  placeholder = 'اكتب محتوى المقال مع التنسيقات...',
  maxLength = 9500,
  rows = 8,
  allowInlineImageUpload = true,
}: RichBlogEditorProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inlineImgInputRef = useRef<HTMLInputElement>(null);

  const wordCount = stripMarkdownForPreview(value).split(/\s+/).filter(Boolean).length;
  const readingMins = estimateReadingMinutes(value);

  const applyWrap = (prefix: string, suffix: string, fallbackText: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${value ? '\n' : ''}${prefix}${fallbackText}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallbackText;
    const updated = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(updated.slice(0, maxLength));

    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selected.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyLinePrefix = (linePrefix: string, fallbackText: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${value ? '\n' : ''}${linePrefix}${fallbackText}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    const before = value.slice(0, start);
    const needLeadingNewline = before.length > 0 && !before.endsWith('\n');
    const insertion = selected
      ? selected
          .split('\n')
          .map((l) => `${linePrefix}${l}`)
          .join('\n')
      : `${linePrefix}${fallbackText}`;

    const fullInsert = `${needLeadingNewline ? '\n' : ''}${insertion}`;
    const updated = `${before}${fullInsert}${value.slice(end)}`;
    onChange(updated.slice(0, maxLength));

    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + fullInsert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertBlockSnippet = (snippet: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const lead = before.length > 0 && !before.endsWith('\n') ? '\n\n' : before.length > 0 && !before.endsWith('\n\n') ? '\n' : '';
    const trail = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const updated = `${before}${lead}${snippet}${trail}${after}`;
    onChange(updated.slice(0, maxLength));
    requestAnimationFrame(() => el?.focus());
  };

  const handleInsertLink = () => {
    const cleanUrl = linkUrl.trim();
    if (!isSafeHttpUrl(cleanUrl)) {
      showToast('يرجى إدخال رابط صحيح يبدأ بـ https:// أو http://', 'error');
      return;
    }
    const cleanLabel = linkLabel.trim() || cleanUrl;
    applyWrap('[', `](${cleanUrl})`, cleanLabel);
    setLinkLabel('');
    setLinkUrl('');
    setShowLinkBox(false);
  };

  const handleInlineImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const check = validateMediaFile(file, { allowImages: true, allowVideos: false, allowAudio: false });
    if (!check.isValid) {
      showToast(check.error || 'الصورة غير صالحة', 'error');
      return;
    }

    setUploadingImg(true);
    setUploadPct(0);
    try {
      const handle = uploadMediaWithControl(file, 'posts', {
        timeoutMs: 25000,
        onProgress: (pct) => setUploadPct(pct),
      });
      const url = await handle.promise;
      insertBlockSnippet(`![${file.name.replace(/\.[^.]+$/, '')}](${url})`);
      showToast('تم إدراج الصورة داخل المقال بنجاح', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر رفع الصورة داخل المقال', 'error');
    } finally {
      setUploadingImg(false);
      setUploadPct(0);
    }
  };

  const toolbarButtons: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    { label: 'عنوان رئيسي', icon: <Heading1 className="w-4 h-4" />, onClick: () => applyLinePrefix('# ', 'عنوان رئيسي') },
    { label: 'عنوان فرعي', icon: <Heading2 className="w-4 h-4" />, onClick: () => applyLinePrefix('## ', 'عنوان فرعي') },
    { label: 'نص عريض', icon: <Bold className="w-4 h-4" />, onClick: () => applyWrap('**', '**', 'نص عريض') },
    { label: 'نص مائل', icon: <Italic className="w-4 h-4" />, onClick: () => applyWrap('*', '*', 'نص مائل') },
    { label: 'تمييز ملون', icon: <Highlighter className="w-4 h-4" />, onClick: () => applyWrap('==', '==', 'فكرة مهمة') },
    { label: 'اقتباس', icon: <Quote className="w-4 h-4" />, onClick: () => applyLinePrefix('> ', 'اقتباس مميز') },
    { label: 'صندوق ملاحظة', icon: <Info className="w-4 h-4" />, onClick: () => applyLinePrefix('> [!NOTE] ', 'ملاحظة للقارئ') },
    { label: 'قائمة نقطية', icon: <List className="w-4 h-4" />, onClick: () => applyLinePrefix('- ', 'عنصر قائمة') },
    { label: 'قائمة مرقمة', icon: <ListOrdered className="w-4 h-4" />, onClick: () => applyLinePrefix('1. ', 'الخطوة الأولى') },
    { label: 'توسيط السطر', icon: <AlignCenter className="w-4 h-4" />, onClick: () => applyLinePrefix('::center:: ', 'فقرة في المنتصف') },
    { label: 'كود برمجي', icon: <Code2 className="w-4 h-4" />, onClick: () => insertBlockSnippet('```\n// اكتب الكود هنا\n```') },
    { label: 'فاصل أنيق', icon: <Minus className="w-4 h-4" />, onClick: () => insertBlockSnippet('---') },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#2A2F3A] bg-slate-50/70 dark:bg-[#0B0F19] overflow-hidden">
      {/* Header Bar: Mode Tabs + Stats */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-[#2A2F3A] bg-white dark:bg-[#161B26] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0B0F19] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'write'
                ? 'bg-[#3B6DFF] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>تحرير</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'preview'
                ? 'bg-[#3B6DFF] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>معاينة حية</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
          <span>{wordCount} كلمة</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#3B6DFF]" />
            <span>{readingMins} د قراءة</span>
          </span>
          <span>·</span>
          <span>
            {value.length}/{maxLength}
          </span>
        </div>
      </div>

      {/* Formatting Toolbar */}
      {mode === 'write' && (
        <div className="px-2.5 py-2 border-b border-slate-200 dark:border-[#2A2F3A] bg-white/80 dark:bg-[#161B26]/80 flex items-center gap-1 flex-wrap">
          {toolbarButtons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.onClick}
              title={btn.label}
              aria-label={btn.label}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] hover:bg-[#3B6DFF]/10 transition-colors cursor-pointer"
            >
              {btn.icon}
            </button>
          ))}

          <span className="w-px h-5 bg-slate-200 dark:bg-[#2A2F3A] mx-0.5" />

          <button
            type="button"
            onClick={() => setShowLinkBox((s) => !s)}
            title="إدراج رابط"
            aria-label="إدراج رابط"
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showLinkBox
                ? 'bg-[#3B6DFF]/15 text-[#3B6DFF]'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#3B6DFF] hover:bg-[#3B6DFF]/10'
            }`}
          >
            <Link2 className="w-4 h-4" />
          </button>

          {allowInlineImageUpload && (
            <>
              <input
                ref={inlineImgInputRef}
                type="file"
                accept="image/*"
                onChange={handleInlineImagePick}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingImg}
                onClick={() => inlineImgInputRef.current?.click()}
                title="إدراج صورة داخل نص المقال"
                className="h-9 px-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-bold text-[#3B6DFF] bg-[#3B6DFF]/10 hover:bg-[#3B6DFF]/15 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {uploadingImg ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="tabular-nums">{uploadPct}%</span>
                  </>
                ) : (
                  <>
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>صورة داخل النص</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Inline Link Drawer */}
      {mode === 'write' && showLinkBox && (
        <div className="p-2.5 border-b border-slate-200 dark:border-[#2A2F3A] bg-slate-100/70 dark:bg-[#111623] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="نص الرابط (مثال: اقرأ المصدر)"
            className="sm:col-span-4 bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
          />
          <input
            type="url"
            dir="ltr"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            className="sm:col-span-6 bg-white dark:bg-[#0B0F19] border border-slate-200 dark:border-[#2A2F3A] rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#3B6DFF]"
          />
          <button
            type="button"
            onClick={handleInsertLink}
            className="sm:col-span-2 py-2 px-3 rounded-xl bg-[#3B6DFF] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            إدراج
          </button>
        </div>
      )}

      {/* Editor Textarea OR Live Preview */}
      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className="w-full bg-transparent p-3.5 text-sm leading-relaxed text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#64748B] focus:outline-none resize-y text-start"
        />
      ) : (
        <div className="p-4 min-h-[210px] max-h-[380px] overflow-y-auto bg-white dark:bg-[#0B0F19]">
          {value.trim() ? (
            <RichBlogContent content={value} />
          ) : (
            <p className="text-xs text-slate-400 dark:text-[#64748B] text-center py-12">
              ابدأ بالكتابة لعرض معاينة حية للتنسيقات والعناوين والاقتباسات...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
