// Single source of truth for the top-nav sections and where they live.
//
// This site is the central CLINIC REGISTRY. Every other section will
// eventually live on its own domain. Until a section's domain is live,
// leave `domain` empty and the nav keeps using the local path (the local
// pages still build and the pipeline still publishes into them).
//
// To move a section out: set `domain` (full origin, no trailing slash),
// e.g. domain: 'https://peptide-news.com'. The nav will link out, and the
// local path is added to site/public/_redirects (Cloudflare Pages) below.
export interface Section {
  label: string;
  path: string;    // local path on this site
  domain: string;  // '' = still hosted here; origin URL once split out
}

export const SECTIONS: Section[] = [
  { label: 'Clinics', path: '/clinics/', domain: '' }, // permanent home: this site
  { label: 'Doctors & experts', path: '/doctors/', domain: '' },
  { label: 'News', path: '/news/', domain: '' },
  { label: 'Laws & legal', path: '/legal/', domain: '' },
  { label: 'Weekly updates', path: '/updates/', domain: '' },
];

export const sectionHref = (s: Section): string => (s.domain ? `${s.domain}/` : s.path);
