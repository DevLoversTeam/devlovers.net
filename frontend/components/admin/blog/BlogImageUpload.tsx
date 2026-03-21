'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

interface BlogImageUploadProps {
  csrfToken: string;
  initialUrl?: string | null;
  onChange: (image: { url: string; publicId: string } | null) => void;
}

export function BlogImageUpload({
  csrfToken,
  initialUrl,
  onChange,
}: BlogImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialUrl ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('csrf_token', csrfToken);

      const res = await fetch('/api/admin/blog/images', {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Upload failed');
        return;
      }

      const data = await res.json();

      setPreviewUrl(data.url);
      onChange({ url: data.url, publicId: data.publicId });
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove() {
    setPreviewUrl(null);
    onChange(null);
  }

  return (
    <div>
      {previewUrl ? (
        <div className="relative inline-block">
          <Image
            src={previewUrl}
            alt="Main image preview"
            width={320}
            height={180}
            className="border-border rounded-lg border object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
          >
            x
          </button>
        </div>
      ) : (
        <label
          className={`border-border hover:border-foreground/30 flex w-full max-w-sm cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
            uploading ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <span className="text-muted-foreground text-sm">
            {uploading ? 'Uploading...' : 'Click to upload main image'}
          </span>
          <span className="text-muted-foreground mt-1 text-xs">
            JPG, PNG, WebP (max 5 MB)
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
        </label>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
