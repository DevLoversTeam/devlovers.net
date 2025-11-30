export const metadata = {
  title: "About | DevLovers",
  description:
    "Discover the mission behind DevLovers - a platform for technical interview preparation across frontend, backend, and full-stack development.",
};

export default function AboutPage() {
  return (
    <main className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">About This Blog</h1>
      <p className="mb-4">
        Welcome to <strong>DevLovers Blog</strong> — a modern headless CMS
        example built with <code>Next.js</code> and <code>Sanity.io</code>.
      </p>
      <p className="mb-4">
        Here you’ll find posts, tutorials, and experiments about web
        development, UI design, and full-stack engineering. This project
        demonstrates how content from Sanity Studio connects seamlessly to a
        Next.js frontend.
      </p>
      <p>
        Author: <strong>Viktor Svertoka</strong> 🚀
      </p>
    </main>
  );
}
