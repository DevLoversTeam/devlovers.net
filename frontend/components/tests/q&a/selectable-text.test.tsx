// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SelectableText from '@/components/q&a/SelectableText';

describe('SelectableText', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('calls onSelectionClear for collapsed selection', () => {
    const onTextSelect = vi.fn();
    const onSelectionClear = vi.fn();
    const { container: root } = render(
      <SelectableText
        onTextSelect={onTextSelect}
        onSelectionClear={onSelectionClear}
      >
        <div>Text</div>
      </SelectableText>
    );
    const wrapper = root.firstChild as HTMLElement;

    vi.stubGlobal(
      'getSelection',
      vi.fn(() => ({
        isCollapsed: true,
        toString: () => '',
      })) as unknown as typeof window.getSelection
    );

    fireEvent.mouseUp(wrapper);
    vi.runAllTimers();

    expect(onSelectionClear).toHaveBeenCalled();
    expect(onTextSelect).not.toHaveBeenCalled();
  });

  it('calls onTextSelect when selection is valid and inside container', () => {
    const onTextSelect = vi.fn();
    const onSelectionClear = vi.fn();

    const { container: root } = render(
      <SelectableText
        onTextSelect={onTextSelect}
        onSelectionClear={onSelectionClear}
      >
        <div>HTML</div>
      </SelectableText>
    );
    const wrapper = root.firstChild as HTMLElement;

    vi.stubGlobal(
      'getSelection',
      vi.fn(() => ({
        isCollapsed: false,
        toString: () => 'HTML',
        getRangeAt: () => ({
          commonAncestorContainer: wrapper,
          getBoundingClientRect: () =>
            ({
              left: 100,
              top: 200,
              width: 50,
              height: 10,
            }) as DOMRect,
        }),
      })) as unknown as typeof window.getSelection
    );

    fireEvent.mouseUp(wrapper);
    vi.runAllTimers();

    expect(onTextSelect).toHaveBeenCalledWith('HTML', { x: 125, y: 200 });
    expect(onSelectionClear).not.toHaveBeenCalled();
  });

  it('ignores selection outside container', () => {
    const onTextSelect = vi.fn();
    const onSelectionClear = vi.fn();

    const { container: root } = render(
      <SelectableText
        onTextSelect={onTextSelect}
        onSelectionClear={onSelectionClear}
      >
        <div>CSS</div>
      </SelectableText>
    );
    const wrapper = root.firstChild as HTMLElement;
    const outside = document.createElement('div');

    vi.stubGlobal(
      'getSelection',
      vi.fn(() => ({
        isCollapsed: false,
        toString: () => 'CSS',
        getRangeAt: () => ({
          commonAncestorContainer: outside,
          getBoundingClientRect: () =>
            ({
              left: 100,
              top: 200,
              width: 50,
              height: 10,
            }) as DOMRect,
        }),
      })) as unknown as typeof window.getSelection
    );

    fireEvent.mouseUp(wrapper);
    vi.runAllTimers();

    expect(onTextSelect).not.toHaveBeenCalled();
  });
});
