// State code ↔ name helpers used for hub pages and internal links.
// Content collections store two-letter codes (see content.config.ts).
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export const stateName = (code: string): string => STATE_NAMES[code.toUpperCase()] ?? code;

export const stateSlug = (code: string): string =>
  stateName(code).toLowerCase().replace(/\s+/g, '-');

// A state gets a hub page at /clinics/{state-slug}/ once it has >= 3 clinics.
export const HUB_MIN_CLINICS = 3;

export function clinicsByState<T extends { data: { state: string } }>(posts: T[]): Record<string, T[]> {
  const byState: Record<string, T[]> = {};
  for (const p of posts) (byState[p.data.state.toUpperCase()] ??= []).push(p);
  return byState;
}

export function hubStates<T extends { data: { state: string } }>(posts: T[]): Set<string> {
  return new Set(
    Object.entries(clinicsByState(posts))
      .filter(([, v]) => v.length >= HUB_MIN_CLINICS)
      .map(([code]) => code)
  );
}
