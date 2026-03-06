/**
 * One-time migration script: Sanity CMS → PostgreSQL
 *
 * Usage:
 *   APP_ENV=local npx tsx db/seed-blog-migration.ts
 *   APP_ENV=production npx tsx db/seed-blog-migration.ts
 *
 * Idempotent: safe to re-run (onConflictDoNothing on slug/composite PK).
 * Delete this file after migration is verified.
 */

import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { uploadImage } from '../lib/cloudinary';
import { db } from './index';
import {
  blogAuthors,
  blogAuthorTranslations,
  blogCategories,
  blogCategoryTranslations,
  blogPostCategories,
  blogPosts,
  blogPostTranslations,
} from './schema';

// ── Types ───────────────────────────────────────────────────────

const LOCALES = ['uk', 'en', 'pl'] as const;

const SANITY_API =
  'https://6y9ive6v.api.sanity.io/v2025-11-29/data/query/production';

type SanityBlock = {
  _type: 'block';
  _key?: string;
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  children?: Array<{
    _type?: string;
    text?: string;
    marks?: string[];
  }>;
  markDefs?: Array<{
    _key?: string;
    _type?: string;
    href?: string;
  }>;
};

type SanityImage = {
  _type: 'image';
  _key?: string;
  url?: string;
};

type SanityNode = SanityBlock | SanityImage;

type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
};

// ── Sanity REST API fetcher ─────────────────────────────────────

async function sanityFetch<T>(query: string): Promise<T> {
  const url = `${SANITY_API}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Sanity API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { result: T };
  return json.result;
}

// ── Image helpers ───────────────────────────────────────────────

async function downloadImageAsBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);

  if (!res.ok) {
    throw new Error(`Failed to download image ${imageUrl}: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function reuploadToCloudinary(
  imageUrl: string,
  folder: string
): Promise<{ url: string; publicId: string }> {
  const buffer = await downloadImageAsBuffer(imageUrl);
  return uploadImage(buffer, { folder });
}

// ── Portable Text → Tiptap JSON ────────────────────────────────

function convertSpansToTiptap(
  children: SanityBlock['children'] = [],
  markDefs: SanityBlock['markDefs'] = []
): TiptapNode[] {
  const linkMap = new Map<string, string>();
  for (const def of markDefs) {
    if (def?._type === 'link' && def._key && def.href) {
      linkMap.set(def._key, def.href);
    }
  }

  const nodes: TiptapNode[] = [];

  for (const child of children) {
    const text = child?.text || '';
    if (!text) continue;

    const marks: TiptapMark[] = [];

    for (const mark of child.marks || []) {
      if (linkMap.has(mark)) {
        marks.push({
          type: 'link',
          attrs: { href: linkMap.get(mark)!, target: '_blank' },
        });
      } else if (mark === 'strong') {
        marks.push({ type: 'bold' });
      } else if (mark === 'em') {
        marks.push({ type: 'italic' });
      } else if (mark === 'underline') {
        marks.push({ type: 'underline' });
      } else if (mark === 'code') {
        marks.push({ type: 'code' });
      } else if (mark === 'strike-through' || mark === 'strike') {
        marks.push({ type: 'strike' });
      }
    }

    const node: TiptapNode = { type: 'text', text };
    if (marks.length > 0) node.marks = marks;
    nodes.push(node);
  }

  return nodes;
}

function blockToTiptapNode(block: SanityBlock): TiptapNode {
  const content = convertSpansToTiptap(block.children, block.markDefs);
  const style = block.style || 'normal';

  if (style.match(/^h[1-6]$/)) {
    const level = parseInt(style[1], 10);
    return {
      type: 'heading',
      attrs: { level },
      content: content.length > 0 ? content : undefined,
    };
  }

  if (style === 'blockquote') {
    return {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: content.length > 0 ? content : undefined,
        },
      ],
    };
  }

  return {
    type: 'paragraph',
    content: content.length > 0 ? content : undefined,
  };
}

async function portableTextToTiptap(
  blocks: SanityNode[],
  imageFolder: string
): Promise<TiptapNode> {
  const content: TiptapNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    // Inline image — re-upload to Cloudinary
    if (block._type === 'image' && (block as SanityImage).url) {
      try {
        const { url } = await reuploadToCloudinary(
          (block as SanityImage).url!,
          imageFolder
        );
        content.push({
          type: 'image',
          attrs: { src: url },
        });
      } catch (err) {
        console.error(
          `  [warn] Failed to upload inline image: ${(block as SanityImage).url}`,
          err
        );
      }
      i++;
      continue;
    }

    // List items — group consecutive same-type items
    if (block._type === 'block' && (block as SanityBlock).listItem) {
      const sanityBlock = block as SanityBlock;
      const listType =
        sanityBlock.listItem === 'number' ? 'orderedList' : 'bulletList';

      const items: TiptapNode[] = [];
      while (
        i < blocks.length &&
        blocks[i]._type === 'block' &&
        (blocks[i] as SanityBlock).listItem === sanityBlock.listItem
      ) {
        const item = blocks[i] as SanityBlock;
        const itemContent = convertSpansToTiptap(item.children, item.markDefs);
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: itemContent.length > 0 ? itemContent : undefined,
            },
          ],
        });
        i++;
      }

      content.push({ type: listType, content: items });
      continue;
    }

    // Regular block
    if (block._type === 'block') {
      content.push(blockToTiptapNode(block as SanityBlock));
      i++;
      continue;
    }

    // Unknown type — skip
    i++;
  }

  return { type: 'doc', content };
}

function extractPlainText(blocks: SanityNode[] | undefined): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b): b is SanityBlock => b?._type === 'block')
    .map(b => (b.children || []).map(c => c.text || '').join(''))
    .join('\n')
    .trim();
}

// ── Slug helper ─────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Migration functions ─────────────────────────────────────────

async function migrateCategories() {
  console.log('\n--- Migrating categories ---');

  const categories = await sanityFetch<
    Array<{
      _id: string;
      title: string;
      description?: string;
      orderRank?: string;
    }>
  >(
    `*[_type == "category"] | order(orderRank asc) { _id, title, description, orderRank }`
  );

  console.log(`Found ${categories.length} categories in Sanity`);

  let inserted = 0;

  for (let idx = 0; idx < categories.length; idx++) {
    const cat = categories[idx];
    const slug = slugify(cat.title);

    const [row] = await db
      .insert(blogCategories)
      .values({
        slug,
        displayOrder: idx,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      console.log(
        `  [skip] Category "${cat.title}" (slug: ${slug}) already exists`
      );
      continue;
    }

    // Sanity title is NOT multilingual — duplicate into 3 locale rows
    const translations = LOCALES.map(locale => ({
      categoryId: row.id,
      locale,
      title: cat.title,
      description: cat.description || null,
    }));

    await db
      .insert(blogCategoryTranslations)
      .values(translations)
      .onConflictDoNothing();

    inserted++;
    console.log(`  [ok] ${cat.title} (slug: ${slug})`);
  }

  console.log(
    `Categories done: ${inserted} inserted, ${categories.length - inserted} skipped`
  );
}

async function migrateAuthors(): Promise<Map<string, string>> {
  console.log('\n--- Migrating authors ---');

  // Sanity _id → our DB uuid
  const idMap = new Map<string, string>();

  const authors = await sanityFetch<
    Array<{
      _id: string;
      slug?: { current?: string };
      name?: Record<string, string>;
      bio?: Record<string, SanityNode[]>;
      jobTitle?: Record<string, string>;
      company?: Record<string, string>;
      city?: Record<string, string>;
      imageUrl?: string;
      socialMedia?: Array<{
        _key?: string;
        platform?: string;
        url?: string;
      }>;
    }>
  >(`*[_type == "author"] {
    _id,
    slug,
    name,
    bio,
    jobTitle,
    company,
    city,
    "imageUrl": image.asset->url,
    socialMedia[]{ _key, platform, url }
  }`);

  console.log(`Found ${authors.length} authors in Sanity`);

  for (const author of authors) {
    const slug =
      author.slug?.current ||
      slugify(author.name?.en || author.name?.uk || 'unknown');

    // Upload profile image to Cloudinary
    let imageUrl: string | null = null;
    let imagePublicId: string | null = null;

    if (author.imageUrl) {
      try {
        const result = await reuploadToCloudinary(
          author.imageUrl,
          'blog/authors'
        );
        imageUrl = result.url;
        imagePublicId = result.publicId;
        console.log(`  [img] Uploaded author image: ${slug}`);
      } catch (err) {
        console.error(
          `  [warn] Failed to upload author image for ${slug}:`,
          err
        );
      }
    }

    const socialMedia = (author.socialMedia || [])
      .filter(s => s.platform && s.url)
      .map(s => ({ platform: s.platform!, url: s.url! }));

    const [row] = await db
      .insert(blogAuthors)
      .values({
        slug,
        imageUrl,
        imagePublicId,
        socialMedia: JSON.stringify(socialMedia),
        displayOrder: 0,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      console.log(`  [skip] Author "${slug}" already exists`);
      // Still need the ID for post mapping — look it up
      const existing = await db
        .select({ id: blogAuthors.id })
        .from(blogAuthors)
        .where(eq(blogAuthors.slug, slug));
      if (existing[0]) idMap.set(author._id, existing[0].id);
      continue;
    }

    idMap.set(author._id, row.id);

    // Insert translations for each locale
    const translations = LOCALES.map(locale => ({
      authorId: row.id,
      locale,
      name:
        author.name?.[locale] ||
        author.name?.en ||
        author.name?.uk ||
        'Unknown',
      bio: extractPlainText(author.bio?.[locale]) || null,
      jobTitle: author.jobTitle?.[locale] || author.jobTitle?.en || null,
      company: author.company?.[locale] || author.company?.en || null,
      city: author.city?.[locale] || author.city?.en || null,
    }));

    await db
      .insert(blogAuthorTranslations)
      .values(translations)
      .onConflictDoNothing();

    console.log(`  [ok] ${slug}`);
  }

  console.log(`Authors done: ${idMap.size} mapped`);
  return idMap;
}

async function migratePosts(authorIdMap: Map<string, string>) {
  console.log('\n--- Migrating posts ---');

  // Load our DB categories for slug → id mapping
  const dbCategories = await db
    .select({ id: blogCategories.id, slug: blogCategories.slug })
    .from(blogCategories);
  const categorySlugMap = new Map(dbCategories.map(c => [c.slug, c.id]));

  // Fetch posts from Sanity with ALL locale bodies (not coalesced)
  const posts = await sanityFetch<
    Array<{
      _id: string;
      slug?: { current?: string };
      title?: Record<string, string>;
      publishedAt?: string;
      tags?: string[];
      resourceLink?: string;
      mainImageUrl?: string;
      categories?: Array<{ _id?: string; title?: string }>;
      authorRef?: { _ref?: string };
      bodyUk?: SanityNode[];
      bodyEn?: SanityNode[];
      bodyPl?: SanityNode[];
    }>
  >(`*[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
    _id,
    slug,
    title,
    publishedAt,
    tags,
    resourceLink,
    "mainImageUrl": mainImage.asset->url,
    "categories": categories[]->{_id, title},
    "authorRef": author,
    "bodyUk": body.uk[]{..., _type == "image" => {..., "url": asset->url}},
    "bodyEn": body.en[]{..., _type == "image" => {..., "url": asset->url}},
    "bodyPl": body.pl[]{..., _type == "image" => {..., "url": asset->url}}
  }`);

  console.log(`Found ${posts.length} posts in Sanity`);

  let inserted = 0;

  for (const post of posts) {
    const slug = post.slug?.current;
    if (!slug) {
      console.log(`  [skip] Post without slug: ${post._id}`);
      continue;
    }

    // Upload mainImage to Cloudinary
    let mainImageUrl: string | null = null;
    let mainImagePublicId: string | null = null;

    if (post.mainImageUrl) {
      try {
        const result = await reuploadToCloudinary(
          post.mainImageUrl,
          'blog/posts'
        );
        mainImageUrl = result.url;
        mainImagePublicId = result.publicId;
        console.log(`  [img] Uploaded main image: ${slug}`);
      } catch (err) {
        console.error(`  [warn] Failed to upload main image for ${slug}:`, err);
      }
    }

    // Resolve author ID via Sanity _ref → our DB uuid
    const authorRef = post.authorRef?._ref;
    const authorId = authorRef ? (authorIdMap.get(authorRef) ?? null) : null;

    const [row] = await db
      .insert(blogPosts)
      .values({
        slug,
        authorId,
        mainImageUrl,
        mainImagePublicId,
        tags: post.tags || [],
        resourceLink: post.resourceLink || null,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        isPublished: true,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      console.log(`  [skip] Post "${slug}" already exists`);
      continue;
    }

    // Convert body for each locale → Tiptap JSON, insert translations
    const bodyByLocale = {
      uk: post.bodyUk,
      en: post.bodyEn,
      pl: post.bodyPl,
    };

    for (const locale of LOCALES) {
      const rawBody = bodyByLocale[locale];
      const title =
        post.title?.[locale] || post.title?.en || post.title?.uk || 'Untitled';

      let body: TiptapNode | null = null;
      if (rawBody && Array.isArray(rawBody) && rawBody.length > 0) {
        body = await portableTextToTiptap(rawBody, 'blog/posts');
      }

      await db
        .insert(blogPostTranslations)
        .values({
          postId: row.id,
          locale,
          title,
          body: body ? JSON.stringify(body) : null,
        })
        .onConflictDoNothing();
    }

    // Insert post ↔ category junction rows
    if (post.categories && post.categories.length > 0) {
      const junctionRows = post.categories
        .map(cat => {
          const catSlug = slugify(cat.title || '');
          const categoryId = categorySlugMap.get(catSlug);
          if (!categoryId) {
            console.log(
              `  [warn] Unknown category "${cat.title}" for post ${slug}`
            );
            return null;
          }
          return { postId: row.id, categoryId };
        })
        .filter(Boolean) as Array<{ postId: string; categoryId: string }>;

      if (junctionRows.length > 0) {
        await db
          .insert(blogPostCategories)
          .values(junctionRows)
          .onConflictDoNothing();
      }
    }

    inserted++;
    const localesWithBody = LOCALES.filter(l => bodyByLocale[l]);
    console.log(
      `  [ok] ${slug} (body: ${localesWithBody.join(', ') || 'none'})`
    );
  }

  console.log(
    `Posts done: ${inserted} inserted, ${posts.length - inserted} skipped`
  );
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('=== Blog Migration: Sanity -> PostgreSQL ===');
  console.log(`APP_ENV: ${process.env.APP_ENV || 'not set'}`);

  await migrateCategories();
  const authorIdMap = await migrateAuthors();
  await migratePosts(authorIdMap);

  console.log('\n=== Migration complete ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
