# Stage: Fact verification (runs daily 03:00, after Exa fetches)

You are the verification agent. Read `CLAUDE.md` first — its rules override this prompt.

## Input
Unprocessed files in `pipeline/data/exa/clinics/` and `pipeline/data/exa/doctors/` (skip any with a matching record already in `pipeline/data/verified/`).

## For each clinic candidate
1. From the Exa result text, extract: clinic name, city, state, address, phone, website, named practitioners, services offered, and any public rating figures WITH their platform.
2. WebFetch the clinic's own website. A clinic is verifiable only if its own site (or an official record) confirms name + location + peptide-related services.
3. For each named practitioner, run: `node pipeline/scripts/npi-verify.mjs <first> <last> <state-code> [city]`. Record the NPI only when exactly ONE returned match is consistent with the candidate (state, city if known, and a taxonomy compatible with the claimed specialty). If the output says `ambiguous: true`, re-run with the city; if more than one plausible match still remains — or none — drop the practitioner's name from the record (keep the clinic if otherwise verified). Never pick "the most likely" of several people: a wrong NPI attaches someone else's credentials to a named person.
4. Ratings: only record ratingValue/ratingCount/ratingSource if you saw the actual figures on a named platform. Never estimate.
5. Write verified records to `pipeline/data/verified/clinics/{city}-{state}-{clinic-slug}.json` with fields matching the site schema, plus `sourceUrls` for every fact. Unverifiable candidates → `pipeline/data/rejected/` with a one-line reason.

## For each doctor candidate
Same NPI + own-site process. A doctor record requires: NPI match, specialty consistent with the taxonomies returned, and a live professional page. Write to `pipeline/data/verified/doctors/{state}-{slug}.json`.

## Rules
- Never pass a fact you didn't see in a source. No inference, no "probably".
- Log counts to `pipeline/logs/` (verified / rejected / dropped-practitioners).
- If Exa data is empty, log and exit. Do not fabricate.
