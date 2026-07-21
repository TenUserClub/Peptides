export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

interface CategorySpec {
  name: string;
  summary: string;
  topics: string[];
}

interface SiteSpec {
  name: string;
  confirmation: string;
  professional: string;
  categories: CategorySpec[];
}

const specs: Record<string, SiteSpec> = {
  clinics: {
    name: 'My Peptide Club',
    confirmation: 'Check the linked clinic website, then confirm current details directly with the clinic before making a care decision.',
    professional: 'Questions about symptoms, eligibility, dosing, or treatment belong with a licensed clinician who knows your medical history.',
    categories: [
      ['Using the registry', 'The registry helps readers research clinics without endorsing a provider or treatment.', ['registry search', 'listing count', 'state pages', 'clinic profiles', 'verification labels']],
      ['Search and filters', 'Search tools narrow public listings by place and documented services.', ['clinic name search', 'city filter', 'state filter', 'service filter', 'clearing filters']],
      ['Clinic verification', 'Listings require a reachable first-party website and evidence for the details shown.', ['first-party websites', 'service confirmation', 'last checked dates', 'verification sources', 're-verification']],
      ['Services and terms', 'Service labels describe what a clinic publicly says it offers, not whether it is appropriate for a reader.', ['peptide therapy', 'GLP-1 care', 'hormone optimization', 'longevity medicine', 'compounded medications']],
      ['Appointments and access', 'Availability and access policies can change and must be confirmed with the provider.', ['new patient availability', 'telehealth', 'referrals', 'contact details', 'waiting times']],
      ['Costs and insurance', 'The registry does not guarantee prices, coverage, reimbursement, or financing.', ['insurance participation', 'self-pay pricing', 'written estimates', 'laboratory costs', 'financing claims']],
      ['Safety and regulation', 'Regulatory status and clinical suitability depend on the specific product, use, and patient.', ['FDA approval', 'compounded drugs', 'research chemicals', 'adverse events', 'prescription requirements']],
      ['Reviews and reputation', 'Public reputation signals need a named platform, date, and enough context to interpret them.', ['rating sources', 'review counts', 'review sentiment', 'sponsored placement', 'complaint claims']],
      ['Accuracy and privacy', 'The registry uses public professional information and offers a documented correction process.', ['listing corrections', 'personal health data', 'public records', 'listing removal', 'data freshness']],
      ['Clinic owners', 'Clinic representatives may request factual changes but cannot buy verification or editorial preference.', ['submitting a clinic', 'updating a listing', 'verification criteria', 'paid placement', 'ownership confirmation']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
  doctors: {
    name: 'Top Peptides List',
    confirmation: 'Confirm credentials through the linked professional source, the NPI Registry, and the clinician or practice directly.',
    professional: 'A directory profile cannot determine whether a clinician or treatment is right for you. Discuss care with a licensed professional.',
    categories: [
      ['Using the directory', 'The directory supports clinician research and does not provide referrals or medical advice.', ['doctor search', 'profile types', 'roundup pages', 'listing counts', 'directory scope']],
      ['Identity and NPI', 'Identity checks use public NPI data and matching professional information.', ['NPI numbers', 'name matching', 'practice locations', 'taxonomy codes', 'credential changes']],
      ['Specialties and services', 'A specialty or service label is shown only when a reliable source supports it.', ['medical specialty', 'GLP-1 care', 'peptide services', 'hormone care', 'longevity care']],
      ['Profiles and roundups', 'Profiles summarize one professional while roundups explain a documented selection method.', ['individual profiles', 'state roundups', 'selection methodology', 'ranking order', 'profile sources']],
      ['Choosing a clinician', 'Readers should assess licensure, scope, communication, and fit for their own needs.', ['license status', 'board certification', 'care philosophy', 'second opinions', 'conflicts of interest']],
      ['Appointments and access', 'Scheduling and access details come from the practice and can change without notice.', ['new patients', 'telehealth visits', 'referral rules', 'practice contact', 'appointment preparation']],
      ['Costs and coverage', 'Coverage and out-of-pocket amounts depend on the clinician, service, insurer, and patient.', ['insurance networks', 'consultation fees', 'laboratory billing', 'medication costs', 'written estimates']],
      ['Safety and prescriptions', 'Clinical decisions require an individual assessment, informed consent, and lawful prescribing.', ['medical screening', 'contraindications', 'prescribing rules', 'follow-up care', 'adverse event reporting']],
      ['Methodology and independence', 'Inclusion depends on verifiable records and stated methods, not payment.', ['editorial independence', 'inclusion criteria', 'source hierarchy', 'review schedule', 'sponsored claims']],
      ['Corrections and privacy', 'Public professional facts can be corrected through a documented review process.', ['profile corrections', 'identity disputes', 'listing removal', 'public information', 'contact privacy']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
  blog: {
    name: 'Peptide Atlas Blog',
    confirmation: 'Open the cited FDA, registry, or peer-reviewed source and confirm that it addresses the exact product, population, and use discussed.',
    professional: 'Educational guides cannot determine whether a peptide product or treatment is appropriate for you. Ask a licensed clinician who knows your history.',
    categories: [
      ['Using the blog', 'Blog pages are educational guides organized by reader intent, not individualized treatment plans.', ['guide categories', 'article dates', 'reading order', 'internal links', 'medical disclaimers']],
      ['Evidence hierarchy', 'A claim is stronger when it is supported by appropriate human evidence, transparent methods, and replication.', ['randomized trials', 'observational studies', 'systematic reviews', 'animal studies', 'laboratory studies']],
      ['Regulatory status', 'Every guide must distinguish approved drugs, compounded preparations, investigational products, and research-use products.', ['FDA approval', 'approved indications', 'off-label use', 'compounded drugs', 'research-use labels']],
      ['Understanding studies', 'Study interpretation depends on design, population, comparator, endpoints, duration, and uncertainty.', ['trial phases', 'sample size', 'control groups', 'surrogate endpoints', 'absolute risk']],
      ['Peptide medicine topics', 'The word peptide describes a broad molecular class and does not establish safety or effectiveness by itself.', ['GLP-1 medicines', 'peptide hormones', 'drug delivery', 'metabolic indications', 'oncology applications']],
      ['Safety questions', 'Safety information must be tied to the exact product and use rather than generalized across all peptides.', ['side effects', 'contraindications', 'drug interactions', 'adverse event reporting', 'product quality']],
      ['Choosing care', 'Guides help readers verify providers and claims without recommending a clinic, clinician, or treatment.', ['clinician credentials', 'clinic claims', 'second opinions', 'informed consent', 'follow-up plans']],
      ['Costs and access', 'Prices and access vary by approved indication, insurance plan, prescriber, pharmacy, testing, and location.', ['insurance coverage', 'self-pay prices', 'laboratory costs', 'telehealth access', 'pharmacy sourcing']],
      ['Sources and citations', 'Material claims should link to specific authoritative evidence rather than a search result or marketing page.', ['FDA pages', 'specific PubMed records', 'ClinicalTrials.gov studies', 'NPI records', 'state license records']],
      ['Editorial controls', 'Published guides carry authorship, source, correction, and review information so readers can assess accountability.', ['author bylines', 'qualified review', 'conflict disclosure', 'correction notes', 'AI assistance']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
  legal: {
    name: 'Peptide Atlas Laws & Legal',
    confirmation: 'Read the linked statute, regulation, agency document, warning letter, court filing, or other primary source and check its date and jurisdiction.',
    professional: 'Legal summaries are general information, not legal advice. Ask a qualified attorney about how a rule or proceeding applies to a specific situation.',
    categories: [
      ['Using legal coverage', 'Legal pages identify the governing authority, jurisdiction, source date, and limits of the summary.', ['legal index', 'federal coverage', 'state coverage', 'source documents', 'publication dates']],
      ['FDA approval law', 'FDA approval is product- and indication-specific and differs from registration, listing, or compounding status.', ['drug approval', 'approved labeling', 'unapproved drugs', 'investigational use', 'biological products']],
      ['Section 503A compounding', 'Section 503A describes conditions for patient-specific compounding by eligible pharmacists and physicians.', ['patient prescriptions', 'commercially available drugs', 'bulk substances', 'state-licensed pharmacies', '503A exemptions']],
      ['Section 503B facilities', 'Section 503B governs registered outsourcing facilities and differs from traditional patient-specific compounding.', ['outsourcing registration', 'facility inspections', 'bulk substance limits', 'adverse event reports', '503B exemptions']],
      ['Drug shortages', 'Shortage status can affect compounding rules, but the exact product, date, and statutory conditions still matter.', ['shortage list', 'shortage resolution', 'essentially copies', 'enforcement discretion', 'availability dates']],
      ['Enforcement actions', 'Agency actions must be read for the named product, company, conduct, legal basis, and procedural stage.', ['warning letters', 'recalls', 'seizures', 'injunctions', 'civil penalties']],
      ['Marketing and claims', 'Health advertising and promotional claims can trigger FDA, FTC, state, or professional-board scrutiny.', ['misleading approval claims', 'health benefit claims', 'testimonials', 'telehealth promotion', 'sponsored placement']],
      ['State requirements', 'State pharmacy, medical, prescribing, and telehealth rules can add requirements beyond federal law.', ['medical licenses', 'pharmacy licenses', 'telehealth prescribing', 'scope of practice', 'state board orders']],
      ['Courts and procedure', 'A complaint, motion, order, and final judgment have different legal significance and must not be conflated.', ['complaints', 'motions', 'court orders', 'settlements', 'appeals']],
      ['Legal sourcing and corrections', 'Legal reporting should preserve the primary document, procedural posture, update history, and correction record.', ['case citations', 'agency dockets', 'effective dates', 'correction requests', 'withdrawn guidance']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
  news: {
    name: 'Peptides News',
    confirmation: 'Open the named primary source and check its date, scope, and exact language before relying on a report.',
    professional: 'News cannot answer personal medical questions. A licensed clinician can interpret developments for an individual situation.',
    categories: [
      ['Using Peptides News', 'The newsroom organizes source-led reporting and clearly separates reporting from advice.', ['news feed', 'story pages', 'publication dates', 'topic labels', 'RSS feed']],
      ['Coverage and topics', 'Coverage focuses on material research, regulation, compounding, safety, and market developments.', ['FDA news', 'clinical research', 'compounding policy', 'drug safety', 'industry changes']],
      ['Primary sources', 'Each report should identify the original agency, court, registry, journal, or institution.', ['agency releases', 'court documents', 'trial records', 'journal papers', 'company filings']],
      ['FDA and regulation', 'Agency actions can apply to a product, manufacturer, claim, or circumstance rather than an entire category.', ['approvals', 'warning letters', 'safety communications', 'shortage updates', 'advisory meetings']],
      ['Clinical trials', 'Trial news needs phase, population, endpoints, limitations, and result status.', ['trial phases', 'primary endpoints', 'participant counts', 'interim results', 'trial registration']],
      ['Compounding news', 'Compounding stories require precise distinctions between facilities, substances, and legal authorities.', ['503A updates', '503B updates', 'bulk lists', 'enforcement', 'shortage policy']],
      ['Freshness and corrections', 'Fast reporting still requires source checks, visible dates, and prompt correction of errors.', ['breaking updates', 'article revisions', 'correction notes', 'stale stories', 'follow-up coverage']],
      ['Reading and interpretation', 'Headlines are starting points; readers should examine methods, denominators, and uncertainty.', ['relative risk', 'absolute risk', 'press releases', 'study limitations', 'causation claims']],
      ['Sharing and attribution', 'Readers and publishers should preserve links, context, and source attribution.', ['quoting stories', 'sharing links', 'RSS reuse', 'image rights', 'source credit']],
      ['Publishers and submissions', 'Tips are evaluated for public importance, source quality, and conflicts of interest.', ['news tips', 'press releases', 'embargoes', 'correction requests', 'conflict disclosure']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
  updates: {
    name: 'Peptide Updates',
    confirmation: 'Follow the link attached to each digest item and confirm the date and source on the destination page.',
    professional: 'A weekly digest is informational and cannot replace medical, legal, or financial advice from a qualified professional.',
    categories: [
      ['Using the weekly digest', 'The digest collects eligible items from the Peptide Atlas network in one dated briefing.', ['digest homepage', 'weekly editions', 'item links', 'reading order', 'edition dates']],
      ['Inclusion criteria', 'An item appears only after its underlying page passes the relevant publication checks.', ['minimum item count', 'eligible stories', 'verified listings', 'duplicate removal', 'editorial thresholds']],
      ['Clinic updates', 'Clinic items reflect newly verified or materially updated public listings.', ['new clinics', 'updated services', 'location changes', 'verification dates', 'removed listings']],
      ['Doctor updates', 'Doctor items reflect NPI-checked profiles, roundups, or material record changes.', ['new profiles', 'new roundups', 'NPI changes', 'specialty updates', 'practice changes']],
      ['News and legal items', 'Reporting links preserve the primary source and the distinction between news and legal analysis.', ['news reports', 'legal reports', 'FDA actions', 'court developments', 'policy changes']],
      ['Guides and explainers', 'Evergreen guides are included when they add useful context to current developments.', ['new guides', 'updated guides', 'comparison pages', 'safety explainers', 'cost explainers']],
      ['Dates and freshness', 'Each edition has a week-of date while linked pages retain their own publication and update dates.', ['week-of dates', 'publication dates', 'late additions', 'stale links', 'time zones']],
      ['Links and sources', 'Digest summaries are short and direct readers to the full, sourced page.', ['canonical links', 'primary sources', 'broken links', 'external links', 'source labels']],
      ['Corrections', 'A corrected source page should be reflected in the digest when the change is material.', ['correction notes', 'updated summaries', 'withdrawn items', 'reader reports', 'source changes']],
      ['Delivery and privacy', 'The current digest is published on the web without requiring personal health information.', ['web access', 'email plans', 'RSS plans', 'analytics', 'contact privacy']],
    ].map(([name, summary, topics]) => ({ name, summary, topics })) as CategorySpec[],
  },
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function createFaqs(siteKey: keyof typeof specs): { site: SiteSpec; items: FaqItem[] } {
  const site = specs[siteKey];
  const items: FaqItem[] = [];
  for (const category of site.categories) {
    for (const topic of category.topics) {
      const variants = [
        [`How does ${site.name} handle ${topic}?`, `${category.summary} For ${topic}, the page should state the relevant scope, date, and source instead of turning a short label into a recommendation or conclusion.`],
        [`What should I check before relying on ${topic}?`, `Check the exact claim, named source, date, population or jurisdiction, and stated limitations for ${topic}. ${site.confirmation} ${site.professional}`],
      ];
      variants.forEach(([question, answer], index) => items.push({
        id: `${slugify(category.name)}-${slugify(topic)}-${index + 1}`,
        category: category.name,
        question,
        answer,
      }));
    }
  }
  return { site, items };
}
