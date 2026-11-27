import { NextRequest, NextResponse } from 'next/server';

import { requireAdminApi } from '@/lib/auth/admin';
import { getAdminBlogAccessErrorResponse } from '@/lib/blog/admin-route-responses';
import { uploadImage } from '@/lib/cloudinary';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return noStoreJson(
        { error: 'Invalid form data', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const csrfResult = requireAdminCsrf(
      request,
      'admin:blog:image',
      formData
    );
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return noStoreJson(
        { error: 'File is required', code: 'MISSING_FILE' },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return noStoreJson(
        { error: 'File too large (max 5 MB)', code: 'FILE_TOO_LARGE' },
        { status: 400 }
      );
    }

    const result = await uploadImage(file, { folder: 'blog/posts' });

    return noStoreJson({ url: result.url, publicId: result.publicId });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_image_upload_failed', error, {});
    return noStoreJson(
      { error: 'Upload failed', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
