export interface Section {
  label: string;
  path: string;
  domain: string;
}

export const SITES = {
  clinics: 'https://peptides-three-phi.vercel.app',
  doctors: 'https://peptides-doctors-and-experts.vercel.app',
  content: 'https://peptides-content.vercel.app',
} as const;

export const SECTIONS: Section[] = [
  { label: 'Clinics', path: '/', domain: SITES.clinics },
  { label: 'Doctors', path: '/', domain: SITES.doctors },
  { label: 'Blog', path: '/blog/', domain: SITES.content },
  { label: 'News', path: '/news/', domain: SITES.content },
  { label: 'Laws & legal', path: '/legal/', domain: SITES.content },
  { label: 'Updates', path: '/updates/', domain: SITES.content },
];

export const sectionHref = (s: Section): string => `${s.domain}${s.path}`;
