export interface Section {
  label: string;
  path: string;
  domain: string;
}

export const SITES = {
  clinics: 'https://mypeptide.club',
  doctors: 'https://toppeptideslist.com',
  blog: 'https://safepeptides.us',
  news: 'https://peptidesnews.us',
  legal: 'https://safepeptides.us',
  updates: 'https://peptidesupdates.com',
  editorial: 'https://safepeptides.us',
} as const;

export const SECTIONS: Section[] = [
  { label: 'Clinics', path: '/', domain: SITES.clinics },
  { label: 'Doctors & experts', path: '/', domain: SITES.doctors },
  { label: 'Blog', path: '/blog/', domain: SITES.blog },
  { label: 'News', path: '/', domain: SITES.news },
  { label: 'Laws & legal', path: '/legal/', domain: SITES.legal },
  { label: 'Updates', path: '/', domain: SITES.updates },
];

export const sectionHref = (s: Section): string => `${s.domain}${s.path}`;
