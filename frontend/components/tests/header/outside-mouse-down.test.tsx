// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { getNotifications } from '@/actions/notifications';
import { NotificationBell } from '@/components/header/NotificationBell';
import { useOutsideMouseDown } from '@/hooks/useOutsideMouseDown';

vi.mock('@/actions/notifications', () => ({
  getNotifications: vi.fn().mockResolvedValue([]),
  markAllAsRead: vi.fn(),
  markAsRead: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

function Dropdown({
  enabled,
  onOutside,
}: {
  enabled: boolean;
  onOutside: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideMouseDown(ref, enabled, onOutside);
  return (
    <div ref={ref}>
      <button type="button">Inside</button>
    </div>
  );
}

describe('outside mouse down', () => {
  it('handles only outside presses while enabled and cleans up on unmount', () => {
    const onOutside = vi.fn();
    const { rerender, unmount } = render(
      <Dropdown enabled onOutside={onOutside} />
    );

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));
    expect(onOutside).not.toHaveBeenCalled();

    const updatedOnOutside = vi.fn();
    rerender(<Dropdown enabled onOutside={updatedOnOutside} />);
    fireEvent.mouseDown(document.body);
    expect(onOutside).not.toHaveBeenCalled();
    expect(updatedOnOutside).toHaveBeenCalledTimes(1);

    rerender(<Dropdown enabled={false} onOutside={updatedOnOutside} />);
    fireEvent.mouseDown(document.body);
    expect(updatedOnOutside).toHaveBeenCalledTimes(1);

    const removeListener = vi.spyOn(document, 'removeEventListener');
    rerender(<Dropdown enabled onOutside={updatedOnOutside} />);
    unmount();
    const removedMouseDown = removeListener.mock.calls.some(
      ([eventName]) => eventName === 'mousedown'
    );
    removeListener.mockRestore();
    expect(removedMouseDown).toBe(true);

    fireEvent.mouseDown(document.body);
    expect(updatedOnOutside).toHaveBeenCalledTimes(1);
  });

  it('refreshes notifications on open and dismisses the panel on an outside press', async () => {
    render(<NotificationBell />);
    const trigger = screen.getByRole('button', { name: 'title' });
    expect(getNotifications).toHaveBeenCalledTimes(1);

    fireEvent.click(trigger);
    await screen.findByText('emptyTitle');
    expect(getNotifications).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(screen.getByText('emptyTitle'));
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() =>
      expect(screen.queryByText('emptyTitle')).not.toBeInTheDocument()
    );
    expect(getNotifications).toHaveBeenCalledTimes(2);
  });
});
