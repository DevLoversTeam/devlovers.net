import groq from 'groq';
import { client } from '../../client';
import BlogFilters from '@/components/blog/BlogFilters';

export const metadata = {
  title: 'Blog | DevLovers',
  description: 'Explore the latest articles and insights',
};

export default async function BlogPage() {
  const posts = await client.fetch(groq`
    *[_type == "post" && defined(slug.current)]
      | order(publishedAt desc) {
        _id,
        title,
        slug,
        publishedAt,
        tags,
        resourceLink,

        "categories": categories[]->title,

        body[] {
          ...,
          children[]{
            text
          }
        },
        "mainImage": mainImage.asset->url,
        "author": author->{
          name,
          company,
          jobTitle,
          city,
          bio,
          "image": image.asset->url,
          socialMedia[]{
            _key,
            platform,
            url
          }
        }
      }
  `);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-10 text-center">All Blog Posts</h1>
      <BlogFilters posts={posts} />
    </main>
  );
}
