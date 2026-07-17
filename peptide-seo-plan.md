# Peptide Atlas operating plan

This is the current implementation plan. Historical single-site and model-specific assumptions have been retired.

## Objective

Build a small, trustworthy search presence around verified clinic and doctor directories plus source-led peptide regulation and education. Quality and correction speed take priority over page volume.

## Publishing loops

| Engine | Input | Required evidence | Destination |
| --- | --- | --- | --- |
| Clinics | City queue and first-party sites | Confirmed clinic site, in-scope service, verified record | Clinics site |
| Doctors | State queue, first-party sites, NPI | Unique verified physician identity and in-scope service | Doctors site |
| News | Recent discoveries | Reachable authoritative primary source | Journal news |
| Legal | Regulation, enforcement, court material | Official agency or court source | Journal legal |
| Blog | Curated topic | At least two authoritative sources | Journal blog |
| Updates | Last seven days of published work | At least three eligible internal items | Journal updates |

Every draft passes humanising and deterministic validation before publication. Daily caps are five combined directory posts and three combined news and legal posts.

## Launch sequence

1. Keep quarantined posts offline.
2. Pass the full repository check.
3. Configure public email settings and automation secrets.
4. Run the pipeline in dry mode and verify no state changes.
5. Run one supervised live cycle with automatic push disabled.
6. Review facts, sources, wording, mobile layouts, and cross-site navigation.
7. Publish the approved set and monitor indexing and corrections.
8. Activate the mapped custom domains after the UI and first compliant content set are stable.

## Success measures

- No sample or placeholder pages indexed.
- No unsupported medical claims or unattributed review summaries.
- Every news and legal article points to its primary source.
- Every directory record can be reverified from its stored source.
- Corrections are acknowledged and handled within five business days.
- Site builds, sitemaps, robots files, and cross-project links remain healthy.

## Deferred work

Do not add lead monetisation, sponsored placement, consultation routing, or aggressive scale until legal review and a period of supervised publication are complete. Supabase integration is optional and should be either connected deliberately to orchestration state or removed to avoid ambiguous ownership.
