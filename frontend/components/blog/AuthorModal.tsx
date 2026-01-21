'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';

type SocialLink = {
  platform?: string;
  url?: string;
  _key?: string;
};

type Author = {
  name?: string;
  image?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  bio?: any;
  socialMedia?: SocialLink[];
};

function plainTextFromPortableText(value: any): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(b => b?._type === 'block')
    .map(b => (b.children || []).map((c: any) => c.text || '').join(''))
    .join('\n')
    .trim();
}

function formatDateGB(dateString?: string) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function SocialIcon({ platform }: { platform?: string }) {
  const p = (platform || '').toLowerCase();

  if (p === 'github') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 .5a11.5 11.5 0 0 0-3.64 22.4c.58.1.8-.25.8-.56v-2.1c-3.26.71-3.95-1.39-3.95-1.39-.53-1.35-1.3-1.71-1.3-1.71-1.07-.73.08-.72.08-.72 1.18.08 1.8 1.21 1.8 1.21 1.05 1.8 2.75 1.28 3.42.98.1-.76.41-1.28.75-1.57-2.6-.3-5.33-1.3-5.33-5.8 0-1.28.46-2.33 1.2-3.15-.12-.3-.52-1.49.12-3.1 0 0 .98-.31 3.2 1.2a11.1 11.1 0 0 1 5.83 0c2.22-1.51 3.2-1.2 3.2-1.2.64 1.61.24 2.8.12 3.1.75.82 1.2 1.87 1.2 3.15 0 4.51-2.73 5.5-5.34 5.79.42.37.8 1.1.8 2.22v3.3c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
        />
      </svg>
    );
  }

  if (p === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.48 1c1.38 0 2.5 1.12 2.5 2.5ZM.22 8.02H4.7V23H.22V8.02ZM8.02 8.02h4.29v2.05h.06c.6-1.14 2.06-2.34 4.24-2.34 4.54 0 5.38 2.99 5.38 6.88V23h-4.48v-6.64c0-1.58-.03-3.62-2.21-3.62-2.21 0-2.55 1.72-2.55 3.5V23H8.02V8.02Z"
        />
      </svg>
    );
  }

  if (p === 'twitter' || p === 'x') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M18.9 2H22l-6.78 7.75L23 22h-6.8l-5.33-6.9L4.8 22H1.7l7.26-8.3L1 2h6.97l4.82 6.27L18.9 2Zm-1.2 18h1.88L7.22 3.9H5.2L17.7 20Z"
        />
      </svg>
    );
  }

  if (p === 'website') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.1a15.9 15.9 0 0 0-1.25-6.02A8.03 8.03 0 0 1 19.93 11ZM12 4c.9 0 2.3 2.1 3.02 7H8.98C9.7 6.1 11.1 4 12 4ZM4.07 13h3.1c.2 2.2.72 4.3 1.25 6.02A8.03 8.03 0 0 1 4.07 13Zm3.1-2H4.07a8.03 8.03 0 0 1 4.35-6.02A15.9 15.9 0 0 0 7.17 11Zm1.81 2h6.04C14.3 17.9 12.9 20 12 20c-.9 0-2.3-2.1-3.02-7Zm6.6 6.02c.53-1.72 1.05-3.82 1.25-6.02h3.1a8.03 8.03 0 0 1-4.35 6.02Z"
        />
      </svg>
    );
  }

  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[10px] font-semibold text-gray-700">
      {p ? p.slice(0, 1).toUpperCase() : '?'}
    </span>
  );
}

export default function AuthorModal({
  author,
  publishedAt,
}: {
  author: Author;
  publishedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const bioText = useMemo(
    () => plainTextFromPortableText(author?.bio),
    [author]
  );

  const formattedDate = useMemo(() => formatDateGB(publishedAt), [publishedAt]);
  const authorName = author?.name || 'Unknown author';
  const metaText = formattedDate ? `${authorName} · ${formattedDate}` : authorName;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hasMeta = author?.jobTitle || author?.company || author?.city;
  const hasSocial =
    Array.isArray(author?.socialMedia) && author.socialMedia.length > 0;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-3 text-[12px] md:text-[13px] text-gray-500 hover:text-[#ff00ff] hover:underline underline-offset-4 transition text-left"
    >
      {metaText}
    </button>
  );

  if (!mounted) return trigger;

  return (
    <>
      {trigger}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center px-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-200 p-6 relative"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="
                  absolute top-3 right-3
                  flex items-center justify-center
                  w-9 h-9
                  rounded-full
                  text-gray-400
                  hover:text-gray-700
                  hover:bg-gray-100
                  transition
                "
              >
                <span className="text-xl leading-none -mt-px">×</span>
              </button>

              <div className="flex items-center gap-4">
                {author?.image && (
                  <div className="relative w-16 h-16 shrink-0">
                    <Image
                      src={author.image}
                      alt={author?.name || 'Author'}
                      fill
                      className="rounded-full object-cover border border-gray-300"
                    />
                  </div>
                )}

                <div className="min-w-0">
                  {author?.name && (
                    <h2 className="text-xl font-semibold text-gray-900">
                      {author.name}
                    </h2>
                  )}

                  {hasMeta && (
                    <p className="text-sm text-gray-600 mt-1">
                      {author?.jobTitle && <span>{author.jobTitle}</span>}
                      {author?.jobTitle &&
                        (author?.company || author?.city) && <span> · </span>}
                      {author?.company && <span>{author.company}</span>}
                      {author?.company && author?.city && <span> · </span>}
                      {author?.city && <span>{author.city}</span>}
                    </p>
                  )}
                </div>
              </div>

              {bioText && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Bio
                  </h3>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {bioText}
                  </p>
                </div>
              )}

              {hasSocial && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Social links
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    {author.socialMedia!.map((item, idx) => {
                      if (!item?.url) return null;
                      const label = item.platform || 'link';

                      return (
                        <a
                          key={item._key || `${label}-${idx}`}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition"
                        >
                          <SocialIcon platform={label} />
                          <span className="capitalize">
                            {label.toLowerCase() === 'twitter' ? 'X' : label}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
