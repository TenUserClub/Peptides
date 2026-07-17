import { loadEnv } from '../scripts/lib.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../scripts/lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

loadEnv();

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
// Image generation requires a model that supports image output.
// Use 'node pipeline/scripts/list-gemini-models.mjs' to discover available models.
// Known working image models: gemini-3.1-flash-image, gemini-3-pro-image
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';

/**
 * Image generation prompt templates per content type.
 * Each template produces detailed, context-aware prompts for Gemini.
 * Safety: no realistic faces, no medical claims, no identifiable people.
 */
const PROMPT_TEMPLATES = {
  /**
   * NEWS — Editorial/scientific illustration.
   * Abstract, data-driven, clinical aesthetic. Never shows identifiable people.
   */
  news: ({ title, description, tags = [] }) => {
    const tagStr = tags.join(', ');
    return `Create a clean, professional editorial illustration for a health science news article. 

Topic: "${title}"
Description: "${description}"
Tags: ${tagStr}

Style: Minimalist flat illustration, modern editorial design, muted clinical color palette (teals, soft blues, warm whites, subtle sage green accents). No text, no logos, no medical claims.

Content: Abstract scientific visualization — perhaps a stylized DNA helix, molecular structures, a clean laboratory setting with no people, or an abstract representation of regulation and policy. Use geometric shapes, soft gradients, and subtle line art. The mood should be trustworthy, calm, and data-literate — like a medical journal header illustration.

Safety: No realistic human faces. No identifiable people. No medical procedures shown. No "before and after" imagery. No text overlays. No brand logos.`;
  },

  /**
   * CLINICS — Modern medical facility, welcoming and trustworthy.
   * Warm, clean, professional. No specific people visible.
   */
  clinics: ({ clinicName, city, state, services = [] }) => {
    const serviceStr = services.slice(0, 2).join(' and ');
    return `Create a clean, professional illustration of a modern peptide therapy clinic in ${city}, ${state}.

Clinic: "${clinicName}"
Services offered: ${serviceStr}

Style: Architectural illustration, clean modern interior design, warm natural lighting, warm whites and soft teals with wood accents. Flat editorial illustration style with subtle depth. No text, no logos.

Content: A welcoming modern medical clinic interior — reception desk, comfortable waiting area with plants, large windows with soft natural light. The space feels clean, calm, and professional. No identifiable people; if any silhouettes are present, they must be abstract and unrecognizable (just shapes, no faces or features). No medical equipment with specific brand names. No syringes or injection imagery.

Safety: No realistic human faces. No identifiable people. No medical procedures shown. No text overlays. No brand logos. No syringes or needles.`;
  },

  /**
   * DOCTORS (roundups) — Professional medical/scientific, abstract.
   * Conveys expertise and trust without showing specific individuals.
   */
  doctors: ({ title, specialty, state }) => {
    return `Create a clean, professional illustration for a medical expert roundup article.

Title: "${title}"
Specialty: ${specialty}
State: ${state}

Style: Minimalist editorial illustration, professional medical aesthetic, muted clinical color palette (deep slate, soft teal, warm white). Flat illustration with subtle line art details. No text, no logos.

Content: An abstract representation of medical expertise and patient care — perhaps a stylized white coat on a hanger, a clean medical office with no people, a scientific microscope, or abstract figures representing collaboration and care. The imagery should convey professionalism and trustworthiness. No identifiable people; any silhouettes must be abstract (just shapes, no faces or features). No specific medical brands.

Safety: No realistic human faces. No identifiable people. No medical procedures shown. No text overlays. No brand logos. No syringes or needles.`;
  },

  /**
   * LEGAL / REGULATORY — Authoritative, government/policy aesthetic.
   * Formal, structured, official-looking without being bureaucratic.
   */
  legal: ({ title, jurisdiction, sourceName }) => {
    return `Create a clean, professional illustration for a legal and regulatory news article about peptide therapy regulation.

Topic: "${title}"
Jurisdiction: ${jurisdiction}
Source: ${sourceName}

Style: Minimalist editorial illustration, formal government aesthetic, muted color palette (deep navy, warm grey, gold accents, soft teal). Clean geometric shapes, subtle textures. No text, no logos.

Content: An abstract representation of law, regulation, and policy — perhaps stylized government building columns, a balanced scale, an official document with a seal, or an abstract representation of rules and oversight. The mood should be authoritative, calm, and informative. No identifiable people; any silhouettes must be abstract (just shapes, no faces or features).

Safety: No realistic human faces. No identifiable people. No text overlays. No brand logos. No specific government seals or official insignia.`;
  },

  /**
   * BLOG — Educational, infographic-style illustration.
   * Conveys learning, science, and clarity. Abstract educational visuals.
   */
  blog: ({ title, description }) => {
    return `Create a clean, professional illustration for an educational health blog article about peptide therapy.

Topic: "${title}"
Description: "${description}"

Style: Minimalist editorial illustration, educational infographic aesthetic, muted clinical color palette (soft teal, warm white, subtle sage green). Flat illustration with clean geometric shapes and subtle line art. No text, no logos.

Content: An abstract educational visualization — perhaps a stylized human body silhouette with highlighted systems, a molecular structure diagram, a comparison chart represented as balanced scales, or an abstract transformation visual. The imagery should convey learning, science, and clarity. No identifiable people; any figures must be abstract (just shapes, no faces or features).

Safety: No realistic human faces. No identifiable people. No medical procedures shown. No text overlays. No brand logos. No syringes or needles.`;
  },

  /**
   * WEEKLY UPDATES — Summary, digest, timeline aesthetic.
   * Calendar-like, organized, informative overview feel.
   */
  updates: ({ weekOf, title }) => {
    return `Create a clean, professional illustration for a weekly digest summary of peptide therapy news and clinic updates.

Week: ${weekOf}
Title: "${title}"

Style: Minimalist editorial illustration, organized timeline aesthetic, muted clinical color palette (soft teal, warm white, subtle sage). Flat illustration with subtle depth. No text, no logos.

Content: An abstract weekly summary visualization — perhaps a stylized calendar with highlighted dates, a flowing timeline with milestones, or an organized collection of information represented as clean geometric shapes. The mood should be organized, informative, and easy to digest. No identifiable people; any silhouettes must be abstract (just shapes, no faces or features).

Safety: No realistic human faces. No identifiable people. No text overlays. No brand logos.`;
  },

  /**
   * SOCIAL / OG — Generic shareable image for social media.
   * Clean, branded, recognizable thumbnail.
   */
  social: ({ title, description }) => {
    return `Create a clean, professional thumbnail image for social media sharing of a health science article.

Title: "${title}"
Description: "${description}"

Style: Minimalist editorial illustration, modern health-tech aesthetic, muted clinical color palette (teal #0f6e5c, soft blue, warm white). Flat illustration with subtle gradients. No text, no logos.

Content: An abstract, recognizable visual that conveys scientific credibility and modern healthcare — perhaps a stylized molecular structure, abstract DNA helix, clean laboratory equipment, or a geometric medical cross symbol. The image should be visually striking and recognizable even at small sizes. Centered composition with strong visual hierarchy.

Safety: No realistic human faces. No identifiable people. No text overlays. No brand logos. No medical claims.`;
  },
};

/**
 * Generate a featured image for a post.
 *
 * @param {string} type — 'news' | 'clinics' | 'doctors' | 'legal' | 'blog' | 'updates' | 'social'
 * @param {object} context — frontmatter data of the post
 * @param {string} slug — unique identifier for the post (used for filename)
 * @returns {string|null} — path to saved image, or null if skipped/failed
 */
export async function generateImage(type, context, slug) {
  if (!GEMINI_KEY) {
    log('info', 'images: GEMINI_API_KEY not set, skipping image generation');
    return null;
  }

  const template = PROMPT_TEMPLATES[type];
  if (!template) {
    log('warn', `images: unknown type "${type}"`);
    return null;
  }

  const prompt = template(context);
  const siteRoot = type === 'clinics'
    ? join(ROOT, 'site')
    : type === 'doctors'
      ? join(ROOT, 'sites', 'doctors')
      : join(ROOT, 'sites', 'content');
  const outputPath = join(siteRoot, 'public', 'images', type, `${slug}.jpg`);

  log('info', `images: generating ${type} image for ${slug}`);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['Text', 'Image'] },
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404) {
        log('warn', `images: Gemini model "${GEMINI_MODEL}" not found. Run "node pipeline/scripts/list-gemini-models.mjs" to see available models, then set GEMINI_MODEL in .env.`);
      } else {
        log('error', `images: Gemini API error ${res.status}: ${text}`);
      }
      return null;
    }

    const data = await res.json();

    const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!imagePart || !imagePart.inlineData?.data) {
      log('warn', 'images: no image data returned from Gemini');
      return null;
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, imageBuffer);

    log('info', `images: saved ${imageBuffer.length} bytes to ${outputPath}`);
    return `/images/${type}/${slug}.jpg`;
  } catch (e) {
    log('error', `images: generation failed for ${slug}: ${e.message}`);
    return null;
  }
}

/**
 * Generate Open Graph / social sharing image for a post.
 */
export async function generateSocialImage(context, slug) {
  return generateImage('social', context, slug);
}

/**
 * Generate all images for a post in one call.
 * Returns an object with paths to generated images.
 */
export async function generateAllImages(type, context, slug) {
  const result = {
    featured: null,
    social: null,
  };

  result.featured = await generateImage(type, context, slug);

  if (type === 'news' || type === 'clinics' || type === 'legal' || type === 'blog') {
    result.social = await generateSocialImage(context, `${slug}-og`);
  }

  return result;
}
