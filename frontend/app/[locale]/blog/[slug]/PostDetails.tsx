import Image from 'next/image';
import { notFound } from 'next/navigation';
import groq from 'groq';
import { client } from '@/client';

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
  title?: string;
  publishedAt?: string;
  mainImage?: string;
  categories?: string[];
  tags?: string[];
  resourceLink?: string;
  author?: Author;
  body?: any[];
};

function plainTextFromPortableText(value: any): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(b => b?._type === 'block')
    .map(b => (b.children || []).map((c: any) => c.text || '').join(''))
    .join('\n')
    .trim();
}

const query = groq`
  *[_type=="post" && slug.current==$slug][0]{
    "title": coalesce(title[$locale], title.en, title),
    publishedAt,
    "mainImage": mainImage.asset->url,
    "categories": categories[]->title,
    tags,
    resourceLink,

    "author": author->{
      "name": coalesce(name[$locale], name.en, name),
      "company": coalesce(company[$locale], company.en, company),
      "jobTitle": coalesce(jobTitle[$locale], jobTitle.en, jobTitle),
      "city": coalesce(city[$locale], city.en, city),
      "bio": coalesce(bio[$locale], bio.en, bio),
      "image": image.asset->url,
      socialMedia[]{ _key, platform, url }
    },

    "body": coalesce(body[$locale], body.en, body)[]{
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
  const slugParam = String(slug || '').trim();
  if (!slugParam) return notFound();

  const post: Post | null = await client.fetch(query, {
    slug: slugParam,
    locale,
  });

  if (!post?.title) return notFound();

  const authorBio = plainTextFromPortableText(post.author?.bio);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-gray-900">{post.title}</h1>

      <div className="mt-4 text-sm text-gray-500">
        {post.publishedAt && new Date(post.publishedAt).toLocaleDateString()}
      </div>

      {(post.categories?.length || 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.categories!.map((cat, i) => (
            <span
              key={`${cat}-${i}`}
              className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md"
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {(post.tags?.length || 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.tags!.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-md"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {post.mainImage && (
        <div className="relative w-full h-[320px] rounded-2xl overflow-hidden border border-gray-200 my-8">
          <Image
            src={post.mainImage}
            alt={post.title || 'Post image'}
            fill
            className="object-cover"
          />
        </div>
      )}

      <article className="prose prose-gray max-w-none">
        {post.body?.map((block: any) => {
          if (block?._type === 'block') {
            const text = (block.children || [])
              .map((c: any) => c.text || '')
              .join('');
            return <p key={block._key || Math.random()}>{text}</p>;
          }

          if (block?._type === 'image' && block?.url) {
            return (
              <img
                key={block._key || block.url}
                src={block.url}
                alt={post.title || 'Post image'}
                className="rounded-xl border border-gray-200 my-6"
              />
            );
          }

          return null;
        })}
      </article>

      {post.resourceLink && (
        <div className="mt-10">
          <a
            href={post.resourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex bg-green-600 text-white px-5 py-3 rounded-lg hover:bg-green-700 transition"
          >
            Visit Resource →
          </a>
        </div>
      )}

      {(authorBio || post.author?.jobTitle) && (
        <section className="mt-12 p-6 rounded-2xl border border-gray-200 bg-white">
          <h2 className="text-lg font-semibold">About the author</h2>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
            {authorBio}
          </p>
        </section>
      )}
    </main>
  );
}
