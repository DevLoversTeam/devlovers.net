import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contacts" });

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ContactsPage() {
  const t = await getTranslations("contacts");

  return (
    <main className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-4">{t("subtitle")} 💬</p>
      <ul className="space-y-2">
        <li>
          📧 {t("email")}{" "}
          <a
            href="mailto:victor.svertoka@gmail.com"
            className="text-blue-600 hover:underline"
          >
            victor.svertoka@gmail.com
          </a>
        </li>
        <li>
          💼 {t("linkedin")}{" "}
          <a
            href="https://www.linkedin.com/in/viktor-svertoka/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Viktor Svertoka
          </a>
        </li>
        <li>
          🧑‍💻 {t("github")}{" "}
          <a
            href="https://github.com/ViktorSvertoka"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            @ViktorSvertoka
          </a>
        </li>
      </ul>
    </main>
  );
}
