// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createElement,
  type FunctionComponent,
  type ImgHTMLAttributes,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ProductGallery } from '@/components/shop/ProductGallery';

type MockNextImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt'
> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
};

vi.mock('next/image', () => ({
  default: (({ src, alt, ...props }: MockNextImageProps) => {
    const imgProps = { ...props };
    delete imgProps.fill;
    delete imgProps.priority;

    return createElement('img', { src, alt, ...imgProps });
  }) as FunctionComponent<MockNextImageProps>,
}));

describe('ProductGallery', () => {
  it('renders the primary image first and swaps the main image when a thumbnail is selected', () => {
    render(
      createElement(ProductGallery, {
        productName: 'DevLovers Tee',
        badgeLabel: 'Sale',
        images: [
          {
            id: 'img-primary',
            url: 'https://res.cloudinary.com/devlovers/image/upload/primary.png',
            publicId: 'products/primary',
            sortOrder: 0,
            isPrimary: true,
          },
          {
            id: 'img-secondary',
            url: 'https://res.cloudinary.com/devlovers/image/upload/secondary.png',
            publicId: 'products/secondary',
            sortOrder: 1,
            isPrimary: false,
          },
          {
            id: 'img-third',
            url: 'https://res.cloudinary.com/devlovers/image/upload/third.png',
            publicId: 'products/third',
            sortOrder: 2,
            isPrimary: false,
          },
        ],
      })
    );

    const firstThumbnail = screen.getByRole('button', {
      name: 'Show DevLovers Tee photo 1',
    });
    const secondThumbnail = screen.getByRole('button', {
      name: 'Show DevLovers Tee photo 2',
    });

    expect(
      screen.getByRole('img', { name: 'DevLovers Tee photo 1' })
    ).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/devlovers/image/upload/primary.png'
    );
    expect(firstThumbnail).toHaveAttribute('aria-pressed', 'true');
    expect(secondThumbnail).toHaveAttribute('aria-pressed', 'false');
    expect(firstThumbnail.className).toContain('border-foreground');

    fireEvent.click(secondThumbnail);

    expect(
      screen.getByRole('img', { name: 'DevLovers Tee photo 2' })
    ).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/devlovers/image/upload/secondary.png'
    );
    expect(firstThumbnail).toHaveAttribute('aria-pressed', 'false');
    expect(secondThumbnail).toHaveAttribute('aria-pressed', 'true');
    expect(secondThumbnail.className).toContain('border-foreground');
  });

  it('renders only the main image when there is a single gallery image', () => {
    render(
      createElement(ProductGallery, {
        productName: 'Single Image Tee',
        images: [
          {
            id: 'img-only',
            url: 'https://res.cloudinary.com/devlovers/image/upload/only.png',
            publicId: 'products/only',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
      })
    );

    expect(
      screen.getByRole('img', { name: 'Single Image Tee photo 1' })
    ).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/devlovers/image/upload/only.png'
    );
    expect(
      screen.queryByRole('button', { name: 'Show Single Image Tee photo 1' })
    ).not.toBeInTheDocument();
  });

  it('falls back to the placeholder image when gallery images are empty', () => {
    render(
      createElement(ProductGallery, {
        productName: 'Fallback Tee',
        images: [],
      })
    );

    expect(
      screen.getByRole('img', { name: 'Fallback Tee photo 1' })
    ).toHaveAttribute('src', '/placeholder.svg');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('supports keyboard selection on thumbnail buttons with Enter and Space', async () => {
    const user = userEvent.setup();

    render(
      createElement(ProductGallery, {
        productName: 'Keyboard Tee',
        images: [
          {
            id: 'img-primary',
            url: 'https://res.cloudinary.com/devlovers/image/upload/keyboard-primary.png',
            publicId: 'products/keyboard-primary',
            sortOrder: 0,
            isPrimary: true,
          },
          {
            id: 'img-secondary',
            url: 'https://res.cloudinary.com/devlovers/image/upload/keyboard-secondary.png',
            publicId: 'products/keyboard-secondary',
            sortOrder: 1,
            isPrimary: false,
          },
        ],
      })
    );

    const firstThumbnail = screen.getByRole('button', {
      name: 'Show Keyboard Tee photo 1',
    });
    const secondThumbnail = screen.getByRole('button', {
      name: 'Show Keyboard Tee photo 2',
    });

    await user.tab();
    expect(firstThumbnail).toHaveFocus();

    await user.tab();
    expect(secondThumbnail).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('img', { name: 'Keyboard Tee photo 2' })
    ).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/devlovers/image/upload/keyboard-secondary.png'
    );
    expect(firstThumbnail).toHaveAttribute('aria-pressed', 'false');
    expect(secondThumbnail).toHaveAttribute('aria-pressed', 'true');

    firstThumbnail.focus();
    expect(firstThumbnail).toHaveFocus();

    await user.keyboard('{Space}');

    expect(
      screen.getByRole('img', { name: 'Keyboard Tee photo 1' })
    ).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/devlovers/image/upload/keyboard-primary.png'
    );
    expect(firstThumbnail).toHaveAttribute('aria-pressed', 'true');
    expect(secondThumbnail).toHaveAttribute('aria-pressed', 'false');
  });
});
