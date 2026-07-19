function normalizedPlace(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function withoutEmDash(value) {
  return String(value || '').replace(/\u2014/g, ',').trim();
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
    `description: ${JSON.stringify(withoutEmDash(parsed.data.description))}`,
    `category: ${JSON.stringify(topic.category)}`,
    `tags: ${JSON.stringify(tags)}`,
    `sources: ${JSON.stringify(approvedSources)}`,
    'author: "Peptide Atlas Editorial Team"',
    `publishDate: ${today}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n${String(parsed.body).trim()}\n`;
}

export function canonicalClinicPost({ parsed, record, today }) {
  if (!parsed?.data?.description || !String(parsed.body || '').trim()) return null;
  const sources = [...new Set((record.sourceUrls || []).map(normalizeHttpUrl).filter(Boolean))];
  if (!record.clinicName || !record.city || !record.state || sources.length === 0) return null;
  const clinicName = withoutEmDash(record.clinicName);
  const city = withoutEmDash(record.city);
  const state = withoutEmDash(record.state);
  const title = `${clinicName}: verified clinic profile for ${city}, ${state}`;
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(withoutEmDash(parsed.data.description))}`,
    `clinicName: ${JSON.stringify(clinicName)}`,
    `city: ${JSON.stringify(city)}`,
    `state: ${JSON.stringify(state)}`,
    `address: ${JSON.stringify(withoutEmDash(record.address))}`,
    `website: ${JSON.stringify(normalizeHttpUrl(record.website))}`,
    `phone: ${JSON.stringify(withoutEmDash(record.phone))}`,
    `doctorName: ${JSON.stringify(withoutEmDash(record.doctorName))}`,
    `services: ${JSON.stringify(Array.isArray(record.services) ? record.services.map(withoutEmDash) : [])}`,
    'verified: true',
    `sources: ${JSON.stringify(sources)}`,
    'author: "Peptide Atlas Editorial Team"',
    `publishDate: ${today}`,
    '---',
  ].join('\n');
  return `${frontmatter}\n${String(parsed.body).trim()}\n`;
}
