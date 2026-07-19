function normalizedPlace(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = raw.startsWith('//')
    ? `https:${raw}`
    : /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function chooseSingleNpiMatch(matches, { state = '', city = '' } = {}) {
  const wantedState = normalizedPlace(state);
  const wantedCity = normalizedPlace(city);
  let eligible = (matches || []).filter((match) => match.status !== 'D');

  if (wantedState) {
    eligible = eligible.filter((match) => (match.addresses || []).some(
      (address) => normalizedPlace(address.state) === wantedState
    ));
  }
  if (wantedCity) {
    eligible = eligible.filter((match) => (match.addresses || []).some(
      (address) => normalizedPlace(address.state) === wantedState &&
        normalizedPlace(address.city) === wantedCity
    ));
  }

  return eligible.length === 1 ? eligible[0] : null;
}

export function canonicalBlogPost({ parsed, topic, approvedSources, today }) {
  if (!parsed?.data?.description || !String(parsed.body || '').trim()) return null;
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 8)
    : [];
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(topic.title)}`,
    `description: ${JSON.stringify(String(parsed.data.description).trim())}`,
    `category: ${JSON.stringify(topic.category)}`,
    `tags: ${JSON.stringify(tags)}`,
    `sources: ${JSON.stringify(approvedSources)}`,
    'author: "Peptide Atlas Editorial Team"',
    `publishDate: ${today}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n${String(parsed.body).trim()}\n`;
}
