// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmModal } from '@/components/ui/confirm-modal';

describe('ConfirmModal', () => {
  it('exposes dialog semantics, focuses cancel, and closes on Escape', async () => {
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen
        title="Clear progress?"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables actions while confirmation is pending', () => {
    render(
      <ConfirmModal
        isOpen
        title="Clear progress?"
        message="Please wait."
        isConfirming
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
