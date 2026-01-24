import Image from 'next/image';
import { notFound } from 'next/navigation';
import groq from 'groq';
import { getTranslations } from 'next-intl/server';
import { client } from '@/client';
import { Link } from '@/i18n/routing';

export const revalidate = 0;

type SocialLink = {
  _key?: string;
  platform?: string;
  url?: string;
};

type Author = {
  name?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  image?: string;
  bio?: any;
  socialMedia?: SocialLink[];
};

type Post = {
  _id?: string;
  title?: string;
  publishedAt?: string;
  mainImage?: string;
  categories?: string[];
  tags?: string[];
  resourceLink?: string;
  author?: Author;
  body?: any[];
  slug?: { current?: string };
};

function plainTextFromPortableText(value: any): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(b => b?._type === 'block')
    .map(b => (b.children || []).map((c: any) => c.text || '').join(''))
    .join('\n')
    .trim();
}

function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (!part) return null;
    if (urlRegex.test(part)) {
      return (
        <a
          key={`link-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-primary)] underline underline-offset-4"
        >
          {part}
        </a>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

function renderPortableTextSpans(
  children: Array<{ _type?: string; text?: string; marks?: string[] }> = [],
  markDefs: Array<{ _key?: string; _type?: string; href?: string }> = []
) {
  const linkMap = new Map(
    markDefs
      .filter(def => def?._type === 'link' && def?._key && def?.href)
      .map(def => [def._key as string, def.href as string])
  );

  return children.map((child, index) => {
    const text = child?.text || '';
    if (!text) return null;
    const marks = child?.marks || [];
    const linkKey = marks.find(mark => linkMap.has(mark));

    if (linkKey) {
      const href = linkMap.get(linkKey)!;
      return (
        <a
          key={`mark-link-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-primary)] underline underline-offset-4"
        >
          {text}
        </a>
      );
    }

    return <span key={`mark-text-${index}`}>{linkifyText(text)}</span>;
  });
}

function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let value = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    value = (value * 1664525 + 1013904223) % 4294967296;
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const query = groq`
  *[_type=="post" && slug.current==$slug][0]{
    _id,
    "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
    publishedAt,
    "mainImage": mainImage.asset->url,
    "categories": categories[]->title,
    tags,
    resourceLink,

    "author": author->{
      "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
      "company": coalesce(company[$locale], company[lower($locale)], company.uk, company.en, company.pl, company),
      "jobTitle": coalesce(jobTitle[$locale], jobTitle[lower($locale)], jobTitle.uk, jobTitle.en, jobTitle.pl, jobTitle),
      "city": coalesce(city[$locale], city[lower($locale)], city.uk, city.en, city.pl, city),
      "bio": coalesce(bio[$locale], bio[lower($locale)], bio.uk, bio.en, bio.pl, bio),
      "image": image.asset->url,
      socialMedia[]{ _key, platform, url }
    },

    "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
      ...,
      _type == "image" => {
        ...,
        "url": asset->url
      }
    }
  }
`;
const recommendedQuery = groq`
  *[_type=="post" && defined(slug.current) && slug.current != $slug]{
    _id,
    "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
    publishedAt,
    "mainImage": mainImage.asset->url,
    slug,
    "author": author->{
      "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
      "image": image.asset->url
    },
    "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
      ...,
      _type == "image" => {
        ...,
        "url": asset->url
      }
    }
  }
`;

export default async function PostDetails({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tNav = await getTranslations({ locale, namespace: 'navigation' });
  const slugParam = String(slug || '').trim();
  if (!slugParam) return notFound();

  const post: Post | null = await client
    .withConfig({ useCdn: false })
    .fetch(query, {
    slug: slugParam,
    locale,
  });
  const recommendedAll: Post[] = await client
    .withConfig({ useCdn: false })
    .fetch(recommendedQuery, {
    slug: slugParam,
    locale,
  });
  const recommendedPosts = seededShuffle(
    recommendedAll,
    hashString(slugParam)
  ).slice(0, 3);

  if (!post?.title) return notFound();

  const authorBio = plainTextFromPortableText(post.author?.bio);
  const authorName = post.author?.name;
  const authorMetaParts = [
    post.author?.jobTitle,
    post.author?.company,
    post.author?.city,
  ].filter(Boolean) as string[];
  const authorMeta = authorMetaParts.join(' · ');
  const categoryLabel = post.categories?.[0];

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-6 relative left-1/2 right-1/2 w-screen -translate-x-1/2 px-6">
        <div className="mx-auto flex max-w-6xl justify-start">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link
              href="/blog"
              className="transition hover:text-[var(--accent-primary)] hover:underline underline-offset-4"
            >
              {tNav('blog')}
            </Link>
            <span>&gt;</span>
            <span className="text-[var(--accent-primary)]">{post.title}</span>
          </div>
        </div>
      </div>

      {categoryLabel && (
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
          <Link
            href={`/blog?category=${encodeURIComponent(categoryLabel)}`}
            className="inline-flex items-center gap-1 text-[var(--accent-primary)] transition"
          >
            {categoryLabel === 'Growth' ? 'Career' : categoryLabel}
          </Link>
        </div>
      )}
      <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-gray-100 text-center">
        {post.title}
      </h1>

      {(authorName || post.publishedAt) && (
        <div className="mt-4 flex justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {authorName && (
            <Link
              href={`/blog?author=${encodeURIComponent(authorName)}`}
              className="transition hover:text-[var(--accent-primary)]"
            >
              {authorName}
            </Link>
          )}
          {authorName && post.publishedAt && <span>·</span>}
          {post.publishedAt && (
            <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {(post.tags?.length || 0) > 0 && null}

      {post.mainImage && (
        <div className="relative w-full h-[420px] rounded-2xl overflow-hidden border border-gray-200 my-8">
          <Image
            src={post.mainImage}
            alt={post.title || 'Post image'}
            fill
            className="object-cover object-top scale-[1.05]"
          />
        </div>
      )}

      <article className="prose prose-gray max-w-none">
        {post.body?.map((block: any, index: number) => {
          if (block?._type === 'block') {
            return (
              <p
                key={block._key || `block-${index}`}
                className="whitespace-pre-line"
              >
                {renderPortableTextSpans(block.children, block.markDefs)}
              </p>
            );
          }

          if (block?._type === 'image' && block?.url) {
            return (
              <img
                key={block._key || `image-${index}`}
                src={block.url}
                alt={post.title || 'Post image'}
                className="rounded-xl border border-gray-200 my-6"
              />
            );
          }

          return null;
        })}
      </article>

      {recommendedPosts.length > 0 && (
        <>
          <div className="mt-16 relative left-1/2 right-1/2 w-screen -translate-x-1/2 px-6">
            <div className="mx-auto h-px w-full max-w-6xl bg-gray-200 dark:bg-gray-800" />
          </div>

          <section className="mt-10 relative left-1/2 right-1/2 w-screen -translate-x-1/2 px-6">
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {t('recommendedPosts')}
              </h2>
              <div className="mt-6 grid gap-6 auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
                {recommendedPosts.map(item => (
                  <Link
                    key={item._id}
                    href={`/blog/${item.slug?.current}`}
                    className="group flex h-full flex-col"
                  >
                    {item.mainImage && (
                      <div className="relative h-48 w-full overflow-hidden rounded-2xl">
                        <Image
                          src={item.mainImage}
                          alt={item.title || 'Post image'}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                    )}
                  <h3 className="mt-4 text-lg font-semibold text-gray-900 transition group-hover:underline underline-offset-4 dark:text-gray-100">
                    {item.title}
                  </h3>
                  {item.body && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400 line-clamp-2">
                      {plainTextFromPortableText(item.body)}
                    </p>
                  )}
                  {(item.author?.name || item.publishedAt) && (
                    <div className="mt-auto pt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      {item.author?.image && (
                        <span className="relative h-5 w-5 overflow-hidden rounded-full">
                          <Image
                            src={item.author.image}
                              alt={item.author.name || 'Author'}
                              fill
                              className="object-cover"
                            />
                          </span>
                        )}
                        {item.author?.name && <span>{item.author.name}</span>}
                        {item.author?.name && item.publishedAt && <span>·</span>}
                        {item.publishedAt && (
                          <span>
                            {new Date(item.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {post.resourceLink && null}

      {(authorBio || authorName || authorMeta) && null}
    </main>
  );
}
