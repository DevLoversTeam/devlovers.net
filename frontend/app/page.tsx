import Link from "next/link";
import { client } from "../client";
import groq from "groq";

export default async function Home() {
  const posts = await client.fetch(groq`
    *[_type == "post" && defined(slug.current) && publishedAt < now()]
      | order(publishedAt desc)
      { _id, title, slug, publishedAt }
  `);

  return (
    <main>
      <h1>Welcome to a blog!</h1>
      <ul>
        {posts.map(
          ({ _id, title = "", slug, publishedAt }: any) =>
            slug?.current && (
              <li key={_id}>
                <Link href={`/post/${slug.current}`}>{title}</Link> (
                {publishedAt ? new Date(publishedAt).toDateString() : "—"})
              </li>
            )
        )}
      </ul>
    </main>
  );
}
