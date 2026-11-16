import { useState } from 'react';
import {
  X,
  Info,
  FileText,
  ShieldCheck,
  BookOpen,
  Mail,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { QLogo } from '../common/QLogo';
import { useLanguage } from '../../context/LanguageContext';

interface LegalPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: string | null;
}

export function LegalPagesModal({ isOpen, onClose, initialPage }: LegalPagesModalProps) {
  const { isRTL } = useLanguage();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialPage || null);

  if (!isOpen) return null;

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  const legalContent: Record<string, { title: string; body: string[] }> = {
    about: {
      title: 'حول منصة Q (About Q)',
      body: [
        'منصة Q هي شبكة اجتماعية متقدمة بُنيت لتوفير مساحة تفاعلية نقية تجمع بين الفكر، الإبداع، المعرفة، والاتصال الإنساني الراقي.',
        'نهدف إلى تقديم تجربة مستخدم خالية من التشويش والبيانات الوهمية، حيث تلتقي المجتمعات المتخصصة وتزدهر الحوارات المثمرة.',
        'نحن ملتزمون بحماية خصوصية المستخدمين وتعزيز المحتوى الهادف والمستنير.',
      ],
    },
    terms: {
      title: 'الشروط والأحكام (Terms of Service)',
      body: [
        '1. القبول بالشروط: باستخدامك لمنصة Q، فإنك توافق على الامتثال لهذه الشروط وجميع القوانين المعمول بها.',
        '2. مسؤولية المحتوى: يتحمل كل مستخدم المسؤولية الكاملة عن المنشورات والتعليقات والوسائط التي يشاركها.',
        '3. النزاهة وحظر الاحتيال: يُحظر تماماً إنشاء حسابات مزيفة أو انتحال شخصيات أخرى أو نشر أخبار مضللة أو روابط ضارة.',
        '4. الملكية الفكرية: يحتفظ المستخدمون بحقوق ملكية محتواهم الأصلي، مع منح المنصة ترخيصاً لعرضه ومشاركته داخل التطبيق.',
      ],
    },
    privacy: {
      title: 'سياسة الخصوصية (Privacy Policy)',
      body: [
        '1. جمع البيانات: نقوم بجمع معلومات الحساب الأساسية (مثل الاسم، البريد، والبيانات العامة) لغرض تشغيل الحساب ومصادقة الدخول بأمان.',
        '2. عدم بيع البيانات: لا نقوم ببيع أو تأجير بيانات المستخدمين لأي أطراف خارجية أو معلنين.',
        '3. حماية البيانات: نستخدم معايير تشفير صارمة لحماية كلمات المرور والرسائل والملفات الشخصية.',
        '4. حق التحكم: يحق للمستخدم في أي وقت تعديل بياناته، أو حذف حسابه، أو تنزيل نسخة من بياناته المسجلة.',
      ],
    },
    guidelines: {
      title: 'دليل المجتمع (Community Guidelines)',
      body: [
        '1. الاحترام المتبادل: الحوار الراقي والاحترام هما الأساس في جميع مجتمعات ومساحات Q.',
        '2. مكافحة خطاب الكراهية: لا يُسمح بأي شكل من أشكال التحريض، التنمر، الإساءة، أو التمييز القائم على العرق أو الدين أو الجنس.',
        '3. المحتوى الآمن: يُمنع منعاً باتاً نشر محتوى غير لائق، إباحي، أو يحث على العنف والإيذاء الذاتي.',
        '4. الإشراف والنزاهة: يمتلك فريق المشرفين صلاحية تعليق أو حذف أي منشور ينتهك معايير المجتمع.',
      ],
    },
    contact: {
      title: 'تواصل معنا (Contact Us)',
      body: [
        'يسعدنا دائماً الاستماع إلى آرائكم، اقتراحاتكم، واستفساراتكم.',
        'البريد الإلكتروني الرسمي للدعم الفني والاستفسارات العامة: support@qsocial.app',
        'لفريق العلاقات المؤسسية والتوثيق الحكومي: verify@qsocial.app',
        'مقر الإدارة: منصة Q الرقمية — الشرق الأوسط والعالم.',
      ],
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B0F19]/85 backdrop-blur-md animate-fade-in font-tajawal">
      <div className="relative w-full max-w-sm sm:max-w-md bg-[#161B26] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 end-4 z-20 p-1.5 rounded-full bg-[#0B0F19]/80 hover:bg-[#0B0F19] text-slate-400 hover:text-white transition-colors border border-[#2A2F3A]"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {selectedTopic ? (
          /* Topic Content View */
          <div className="p-6 overflow-y-auto space-y-4">
            <button
              onClick={() => setSelectedTopic(null)}
              className="flex items-center gap-1.5 text-xs text-[#4F8CFF] hover:text-white font-bold"
            >
              <BackArrow className="w-4 h-4" />
              <span>العودة للقائمة الرئيسية</span>
            </button>

            <h2 className="text-base font-bold text-white pt-2 border-b border-[#2A2F3A] pb-2">
              {legalContent[selectedTopic]?.title}
            </h2>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              {legalContent[selectedTopic]?.body.map((p, idx) => (
                <p key={idx} className="bg-[#0B0F19]/60 p-3 rounded-xl border border-[#2A2F3A]">
                  {p}
                </p>
              ))}
            </div>

            <button
              onClick={() => setSelectedTopic(null)}
              className="w-full py-2.5 rounded-xl bg-[#3B6DFF] hover:bg-[#2B5BE5] text-white text-xs font-bold transition-colors mt-4 shadow-lg shadow-[#3B6DFF]/20"
            >
              رجوع
            </button>
          </div>
        ) : (
          /* Main Hub View matching Screen 8 */
          <div className="flex flex-col flex-1 overflow-y-auto">
            {/* Header with glowing Q monogram */}
            <div className="pt-8 pb-5 px-6 text-center space-y-2 bg-gradient-to-b from-[#3B6DFF]/15 via-transparent to-transparent">
              <div className="flex justify-center">
                <QLogo size={56} variant="icon" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-widest">
                Q
              </h2>
              <p className="text-xs text-[#4F8CFF] italic tracking-wide">
                More Than a Platform
              </p>
            </div>

            {/* Links List matching Screen 8 */}
            <div className="px-4 py-2 space-y-1.5 flex-1">
              {/* حول Q */}
              <button
                onClick={() => setSelectedTopic('about')}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F19]/40 hover:bg-[#0B0F19]/80 border border-[#2A2F3A] flex items-center justify-between text-start transition-all"
              >
                <div className="flex items-center gap-3">
                  <Info className="w-4 h-4 text-[#3B6DFF]" />
                  <span className="text-xs font-bold text-slate-200">حول Q</span>
                </div>
                <NextArrow className="w-4 h-4 text-slate-500" />
              </button>

              {/* الشروط والأحكام */}
              <button
                onClick={() => setSelectedTopic('terms')}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F19]/40 hover:bg-[#0B0F19]/80 border border-[#2A2F3A] flex items-center justify-between text-start transition-all"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-200">الشروط والأحكام</span>
                </div>
                <NextArrow className="w-4 h-4 text-slate-500" />
              </button>

              {/* سياسة الخصوصية */}
              <button
                onClick={() => setSelectedTopic('privacy')}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F19]/40 hover:bg-[#0B0F19]/80 border border-[#2A2F3A] flex items-center justify-between text-start transition-all"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-200">سياسة الخصوصية</span>
                </div>
                <NextArrow className="w-4 h-4 text-slate-500" />
              </button>

              {/* دليل المجتمع */}
              <button
                onClick={() => setSelectedTopic('guidelines')}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F19]/40 hover:bg-[#0B0F19]/80 border border-[#2A2F3A] flex items-center justify-between text-start transition-all"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-200">دليل المجتمع</span>
                </div>
                <NextArrow className="w-4 h-4 text-slate-500" />
              </button>

              {/* تواصل معنا */}
              <button
                onClick={() => setSelectedTopic('contact')}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F19]/40 hover:bg-[#0B0F19]/80 border border-[#2A2F3A] flex items-center justify-between text-start transition-all"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-slate-200">تواصل معنا</span>
                </div>
                <NextArrow className="w-4 h-4 text-slate-500" />
              </button>

              {/* إصدار التطبيق */}
              <div className="p-3.5 rounded-2xl bg-[#0B0F19]/20 border border-[#2A2F3A]/60 flex items-center justify-between text-xs text-slate-500">
                <span>إصدار التطبيق</span>
                <span className="text-slate-400">v1.0.0 (2026 Production)</span>
              </div>
            </div>

            {/* Bottom Q Atmospheric Banner */}
            <div className="mt-3 relative h-24 w-full overflow-hidden border-t border-[#2A2F3A] bg-[radial-gradient(circle_at_25%_30%,rgba(59,109,255,0.35),transparent_55%),radial-gradient(circle_at_80%_75%,rgba(96,165,250,0.22),transparent_55%),linear-gradient(135deg,#0B1224_0%,#141E38_60%,#0B0F19_100%)] flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs font-bold text-white/90 tracking-wide">Q Social Network</p>
                <p className="text-[10px] text-[#93C5FD] mt-0.5">Designed for authentic communities & conversations</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
