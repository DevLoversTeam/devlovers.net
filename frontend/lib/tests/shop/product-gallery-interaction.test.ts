// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
  default: (({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    ...props
  }: MockNextImageProps) => {
    return createElement('img', { src, alt, ...props });
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
});
