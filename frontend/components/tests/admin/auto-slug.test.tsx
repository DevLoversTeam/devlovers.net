// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateQuizForm } from '@/components/admin/quiz/CreateQuizForm';
import { useAutoSlug } from '@/components/admin/useAutoSlug';

vi.mock('@/i18n/routing', () => ({ useRouter: () => ({}) }));

describe('automatic admin slugs', () => {
  it('uses only the English quiz title until the slug is edited manually', () => {
    render(
      <CreateQuizForm
        categories={[]}
        csrfTokenQuiz="quiz"
        csrfTokenCategory="category"
      />
    );
    const slug = screen.getByPlaceholderText('quiz-slug');
    const englishTitle = () => screen.getByPlaceholderText('Quiz title (EN)');

    fireEvent.change(englishTitle(), { target: { value: 'React Basics' } });
    expect(slug).toHaveValue('react-basics');

    fireEvent.change(screen.getByPlaceholderText('Quiz description (EN)'), {
      target: { value: 'A description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'UK' }));
    fireEvent.change(screen.getByPlaceholderText('Quiz title (UK)'), {
      target: { value: 'Основи React' },
    });
    expect(slug).toHaveValue('react-basics');

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    fireEvent.change(englishTitle(), { target: { value: 'React Advanced' } });
    expect(slug).toHaveValue('react-advanced');

    fireEvent.change(slug, { target: { value: 'Manual-Slug' } });
    fireEvent.change(englishTitle(), { target: { value: 'Another Title' } });
    expect(slug).toHaveValue('Manual-Slug');

    fireEvent.change(slug, { target: { value: '' } });
    fireEvent.change(englishTitle(), { target: { value: 'Newest Title' } });
    expect(slug).toHaveValue('');
  });

  it.each(['saved-slug', ''])(
    'preserves an existing slug of %j on title changes',
    initialSlug => {
      const { result } = renderHook(() => useAutoSlug(initialSlug));

      act(() => result.current.updateFromTitle('en', 'Updated title'));

      expect(result.current.slug).toBe(initialSlug);
    }
  );

  it('resumes auto-generation when a creation form is reset', () => {
    const { result } = renderHook(() => useAutoSlug());

    act(() => result.current.setManualSlug('custom'));
    act(() => result.current.resetSlug());
    expect(result.current.slug).toBe('');

    act(() => result.current.updateFromTitle('en', 'New category'));
    expect(result.current.slug).toBe('new-category');
  });
});
