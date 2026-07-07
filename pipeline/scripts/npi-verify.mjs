// Verify a practitioner against the free NPI Registry (no API key needed).
// Usage: node npi-verify.mjs "Jane" "Example" TX [Austin]
// Prints JSON matches; exit code 0 with matches, 2 with none.
// The verify agent (stage 4) calls this per doctor. It may record an NPI only
// when exactly ONE match is consistent with the candidate (state, city,
// specialty-compatible taxonomy). count > 1 without a clear disambiguator =
// ambiguous → drop the practitioner's name, per verify.md.

const [first, last, state, city] = process.argv.slice(2);
if (!last) {
  console.error('Usage: node npi-verify.mjs <first-name> <last-name> [state] [city]');
  process.exit(1);
}

const params = new URLSearchParams({
  version: '2.1',
  first_name: first ?? '',
  last_name: last,
  ...(state ? { state } : {}),
  ...(city ? { city } : {}),
  limit: '10',
});

const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`);
if (!res.ok) {
  console.error(`NPI registry error ${res.status}`);
  process.exit(1);
}
const data = await res.json();
const matches = (data.results ?? []).map((r) => ({
  npi: r.number,
  name: `${r.basic?.first_name ?? ''} ${r.basic?.last_name ?? ''}`.trim(),
  credential: r.basic?.credential ?? null,
  status: r.basic?.status ?? null, // "A" = active
  taxonomies: (r.taxonomies ?? []).map((t) => ({ desc: t.desc, primary: t.primary ?? false, state: t.state ?? null })),
  addresses: (r.addresses ?? []).map((a) => ({ purpose: a.address_purpose, city: a.city ?? null, state: a.state ?? null })),
}));

console.log(JSON.stringify({ count: matches.length, ambiguous: matches.length > 1, matches }, null, 2));
process.exit(matches.length > 0 ? 0 : 2);
