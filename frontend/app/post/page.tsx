import Link from "next/link";
import Image from "next/image";
import groq from "groq";
import { client } from "../../client";

export const metadata = {
  title: "Blog | DevLovers",
  description:
    "Explore the latest articles, guides, and insights from the DevLovers platform.",
};

export default async function BlogPage() {
  const posts = await client.fetch(groq`
    *[_type == "post" && defined(slug.current)]
      | order(publishedAt desc)
      {
        _id,
        title,
        slug,
        publishedAt,
        "author": author->name,
        "authorImage": author->image.asset->url,
        "categories": categories[]->title,
        "mainImage": mainImage.asset->url,
        body[] {
          ...,
          children[]{
            text
          }
        }
      }
  `);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-10 text-center">All Blog Posts</h1>

      {posts.length === 0 ? (
        <p className="text-center text-gray-500">No posts published yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {posts.map((post: any) => {
            const excerpt =
              post.body
                ?.filter((block: any) => block._type === "block")
                .map((block: any) =>
                  block.children.map((child: any) => child.text).join(" ")
                )
                .join(" ")
                .slice(0, 200) || "";

            return (
              <article
                key={post._id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                {post.mainImage && (
                  <div className="relative w-full h-56">
                    <Image
                      src={post.mainImage}
                      alt={post.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-6 flex flex-col flex-grow">
                  <Link
                    href={`/post/${post.slug.current}`}
                    className="text-2xl font-semibold text-blue-600 hover:underline"
                  >
                    {post.title}
                  </Link>
                  <div className="mt-4 flex items-center gap-3 text-sm text-gray-700">
                    {post.authorImage && (
                      <div className="relative w-9 h-9 shrink-0">
                        <Image
                          src={post.authorImage}
                          alt={post.author}
                          fill
                          className="rounded-full object-cover border border-gray-300"
                        />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">{post.author}</span>
                      {post.publishedAt && (
                        <span className="text-gray-500 text-xs">
                          {new Date(post.publishedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {post.categories?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {post.categories.map((cat: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                  {excerpt && (
                    <p className="mt-4 text-gray-700 flex-grow leading-relaxed">
                      {excerpt}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
