import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'ar' | 'en' | 'tr';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRTL: boolean;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    home: 'الرئيسية',
    explore: 'اكتشف',
    events: 'الفعاليات',
    messages: 'الرسائل',
    notifications: 'الإشعارات',
    profile: 'حسابي',
    settings: 'الإعدادات',
    moderation: 'لوحة الإدارة',
    forYou: 'لك',
    following: 'المتابعون',
    addStory: 'إضافة قصة',
    followers: 'متابع',
    followingCount: 'يتابع',
    posts: 'المنشورات',
    media: 'الوسائط',
    about: 'حول Q',
    achievements: 'الإنجازات',
    viewAll: 'عرض الكل',
    pinned: 'منشور مثبت',
    founder: 'المؤسس',
    vip: 'مميز',
    follow: 'متابعة',
    unfollow: 'إلغاء المتابعة',
    message: 'مراسلة',
    editProfile: 'تعديل الملف الشخصي',
    all: 'الكل',
    likesAndComments: 'الإعجابات والتعليقات',
    directChats: 'المحادثات الخاصة',
    groups: 'المجموعات',
    searchChats: 'البحث في الرسائل...',
    trendingTopics: 'المواضيع الرائجة',
    suggestedForYou: 'اقتراحات للمتابعة',
    upcomingEvents: 'فعاليات قادمة',
    competitions: 'مسابقات',
    challenges: 'تحديات',
    publicEvents: 'فعاليات عامة',
    officialEvent: 'فعالية رسمية',
    challenge: 'تحدي',
    registerNow: 'التسجيل الآن',
    eventDetails: 'تفاصيل الفعالية',
    account: 'الحساب والملف الشخصي',
    privacy: 'الخصوصية والأمان',
    appearance: 'المظهر والسمة',
    language: 'اللغة',
    security: 'الأمان والجلسات',
    helpAndSupport: 'المساعدة والدعم',
    aboutApp: 'حول تطبيق Q',
    logout: 'تسجيل الخروج',
    publishPost: 'نشر منشور',
    enterQ: 'دخول Q',
    activeNow: 'نشط الآن',
    accountSettings: 'إعدادات الحساب',
    privacySettings: 'إعدادات الخصوصية',
    notificationSettings: 'إعدادات الإشعارات',
    deleteAccount: 'حذف الحساب نهائياً',
    resetPassword: 'إعادة تعيين كلمة المرور',
    theme: 'السمة',
    darkTheme: 'داكن (منتصف الليل)',
    lightTheme: 'فاتح',
    systemTheme: 'تلقائي (حسب النظام)',
    accentColor: 'لون التمييز',
    saveChanges: 'حفظ التغييرات',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    dangerZone: 'منطقة الخطر',
  },
  en: {
    home: 'Home',
    explore: 'Explore',
    events: 'Events',
    messages: 'Messages',
    notifications: 'Notifications',
    profile: 'My Profile',
    settings: 'Settings',
    moderation: 'Admin Console',
    forYou: 'For You',
    following: 'Following',
    addStory: 'Add Story',
    followers: 'Followers',
    followingCount: 'Following',
    posts: 'Posts',
    media: 'Media',
    about: 'About Q',
    achievements: 'Achievements',
    viewAll: 'View All',
    pinned: 'Pinned Post',
    founder: 'Founder',
    vip: 'VIP',
    follow: 'Follow',
    unfollow: 'Unfollow',
    message: 'Message',
    editProfile: 'Edit Profile',
    all: 'All',
    likesAndComments: 'Likes & Comments',
    directChats: 'Direct Chats',
    groups: 'Groups',
    searchChats: 'Search messages...',
    trendingTopics: 'Trending Topics',
    suggestedForYou: 'Suggested for You',
    upcomingEvents: 'Upcoming Events',
    competitions: 'Competitions',
    challenges: 'Challenges',
    publicEvents: 'Public Events',
    officialEvent: 'Official Event',
    challenge: 'Challenge',
    registerNow: 'Register Now',
    eventDetails: 'Event Details',
    account: 'Account & Profile',
    privacy: 'Privacy & Safety',
    appearance: 'Appearance & Theme',
    language: 'Language',
    security: 'Security & Sessions',
    helpAndSupport: 'Help & Support',
    aboutApp: 'About Q Platform',
    logout: 'Sign Out',
    publishPost: 'Publish Post',
    enterQ: 'Enter Q',
    activeNow: 'Active Now',
    accountSettings: 'Account Settings',
    privacySettings: 'Privacy Settings',
    notificationSettings: 'Notification Settings',
    deleteAccount: 'Delete Account Permanently',
    resetPassword: 'Reset Password',
    theme: 'Theme',
    darkTheme: 'Dark (Midnight Navy)',
    lightTheme: 'Light',
    systemTheme: 'System Default',
    accentColor: 'Accent Color',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    confirm: 'Confirm',
    dangerZone: 'Danger Zone',
  },
  tr: {
    home: 'Ana Sayfa',
    explore: 'Keşfet',
    events: 'Etkinlikler',
    messages: 'Mesajlar',
    notifications: 'Bildirimler',
    profile: 'Profilim',
    settings: 'Ayarlar',
    moderation: 'Yönetici Paneli',
    forYou: 'Senin İçin',
    following: 'Takip Edilenler',
    addStory: 'Hikaye Ekle',
    followers: 'Takipçi',
    followingCount: 'Takip',
    posts: 'Gönderiler',
    media: 'Medya',
    about: 'Q Hakkında',
    achievements: 'Başarılar',
    viewAll: 'Tümünü Gör',
    pinned: 'Sabitlenmiş Gönderi',
    founder: 'Kurucu',
    vip: 'VIP',
    follow: 'Takip Et',
    unfollow: 'Takibi Bırak',
    message: 'Mesaj Gönder',
    editProfile: 'Profili Düzenle',
    all: 'Tümü',
    likesAndComments: 'Beğeniler ve Yorumlar',
    directChats: 'Özel Sohbetler',
    groups: 'Gruplar',
    searchChats: 'Mesajlarda ara...',
    trendingTopics: 'Gündemdeki Konular',
    suggestedForYou: 'Takip Önerileri',
    upcomingEvents: 'Yaklaşan Etkinlikler',
    competitions: 'Yarışmalar',
    challenges: 'Meydan Okumalar',
    publicEvents: 'Herkese Açık Etkinlikler',
    officialEvent: 'Resmi Etkinlik',
    challenge: 'Meydan Okuma',
    registerNow: 'Şimdi Kaydol',
    eventDetails: 'Etkinlik Detayları',
    account: 'Hesap ve Profil',
    privacy: 'Gizlilik ve Güvenlik',
    appearance: 'Görünüm ve Tema',
    language: 'Dil',
    security: 'Güvenlik ve Oturumlar',
    helpAndSupport: 'Yardım ve Destek',
    aboutApp: 'Q Uygulaması Hakkında',
    logout: 'Çıkış Yap',
    publishPost: 'Gönderi Paylaş',
    enterQ: 'Q\'ya Katıl',
    activeNow: 'Şimdi Aktif',
    accountSettings: 'Hesap Ayarları',
    privacySettings: 'Gizlilik Ayarları',
    notificationSettings: 'Bildirim Ayarları',
    deleteAccount: 'Hesabı Kalıcı Olarak Sil',
    resetPassword: 'Şifreyi Sıfırla',
    theme: 'Tema',
    darkTheme: 'Karanlık (Gece Mavisi)',
    lightTheme: 'Aydınlık',
    systemTheme: 'Sistem Varsayılanı',
    accentColor: 'Vurgu Rengi',
    saveChanges: 'Değişiklikleri Kaydet',
    cancel: 'İptal',
    confirm: 'Onayla',
    dangerZone: 'Tehlikeli Bölge',
  },
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('q_language') as Language) || 'ar';
  });

  const isRTL = language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRTL]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('q_language', lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
