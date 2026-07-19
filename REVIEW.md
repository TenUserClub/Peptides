# Project review

Last reviewed: 2026-07-17

## Outcome

The repository now has five independent deployable sites, coherent shared UI, correct cross-project header navigation, a permanent Wellness visual system, explicit editorial trust pages, safer contact handling, and a deterministic content publication gate. Previously published generated posts were withdrawn into `pipeline/quarantine/2026-07-17/` because their source quality and factual support were not strong enough for a health-related site.

## Improvements completed

- Header links resolve to the five public custom domains and contain no public Vercel deployment URLs.
- All projects share the same responsive Wellness design system, self-hosted typography, and Peptide Atlas logo.
- Sample markdown is excluded from generated pages, related content, RSS, and sitemaps.
- Site-facing em dashes are rejected during built-output checks.
- Clinic and doctor verification now requires stronger first-party evidence.
- News and legal drafts require reachable authoritative primary sources.
- Blog drafts require multiple authoritative sources.
- Publication checks frontmatter, length, claims, sources, verified-record matches, placeholder domains, and cross-site link targets.
- Publishing builds the correct Astro project and respects combined velocity limits.
- Dry runs no longer advance queues or processed markers.
- Weekly review generation and monitoring are implemented.
- About, editorial policy, corrections, robots, 404, bylines, and source displays are present.
- CI builds and scans all five sites.

## Remaining owner actions

- Set real public contact and corrections email values in all Vercel projects.
- Add repository secrets before enabling scheduled live pipeline runs.
- Supervise several full runs and manually review every proposed post before relying on automation.
- Create or update the five Vercel projects, then attach and verify one mapped domain per project.
- Obtain legal review before monetisation, referrals, sponsored placement, or lead capture.
- Configure Search Console and privacy-respecting analytics after launch content is approved.

## Known boundaries

The system can reduce publishing risk but cannot prove that generated medical or legal writing is correct. Authoritative sources still need editorial interpretation. The current Supabase helper is not the orchestrator's state store. The quarantined posts remain available for audit but must not be restored without fresh sourcing and review.

## Release recommendation

The interface and pipeline can be deployed after `npm run check` passes. Keep production content sparse until at least one supervised pipeline cycle produces material that passes both deterministic checks and human editorial review.
