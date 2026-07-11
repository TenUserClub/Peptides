export interface Section {
  label: string;
  path: string;
  domain: string;
}

export const SECTIONS: Section[] = [
  { label: 'Clinics', path: '/clinics/', domain: '' },
  { label: 'Doctors', path: '/doctors/', domain: '' },
  { label: 'Blog', path: '/blog/', domain: '' },
  { label: 'News', path: '/news/', domain: '' },
  { label: 'Laws & legal', path: '/legal/', domain: '' },
  { label: 'Updates', path: '/updates/', domain: '' },
];

export const sectionHref = (s: Section): string => (s.domain ? `${s.domain}/` : s.path);
