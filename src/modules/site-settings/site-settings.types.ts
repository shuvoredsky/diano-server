export type SettingGroup = 'store_profile' | 'invoice' | 'seo_defaults' | 'contact';

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  twitter?: string;
  tiktok?: string;
}

export interface StoreProfileSetting {
  storeName: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
  phone: string;
  email: string;
  address: string;
  socialLinks?: SocialLinks;
  businessRegistration?: string;
  bin?: string;
  vat?: string;
}

export interface InvoiceSetting {
  prefix: string;
  footerNote?: string;
  termsNote?: string;
  showLogo: boolean;
  signatureText?: string;
}

export interface SeoDefaultsSetting {
  titleTemplate: string;
  description: string;
  ogImage?: string;
}

export interface ContactSetting {
  supportPhone: string;
  supportEmail: string;
  address: string;
  supportHours: string;
}

export interface PublicSiteConfig {
  storeName: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
  phone: string;
  email: string;
  address: string;
  socialLinks?: SocialLinks;
  seoDefaults: SeoDefaultsSetting;
  contact: {
    supportPhone: string;
    supportEmail: string;
    address: string;
    supportHours: string;
  };
}
