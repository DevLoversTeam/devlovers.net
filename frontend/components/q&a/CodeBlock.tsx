'use client';

import { Check, Copy } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Highlight, themes } from 'prism-react-renderer';
import { useState } from 'react';

type Props = {
  code: string;
  language?: string | null;
};

export default function CodeBlock({ code, language }: Props) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  const theme = resolvedTheme === 'dark' ? themes.nightOwl : themes.github;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Highlight
      code={code.trim()}
      language={(language ?? 'markup') as any}
      theme={theme}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`${className} relative overflow-x-auto rounded-lg p-4 text-sm`}
          style={style}
        >
          {language && (
            <div className="absolute top-2 left-3 font-mono text-xs text-gray-400 uppercase">
              {language}
            </div>
          )}

          <button
            onClick={handleCopy}
            aria-label="Copy code"
            className="absolute top-2 right-3 flex cursor-pointer items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs text-gray-400 backdrop-blur transition-colors hover:text-gray-700 dark:bg-black/40 dark:hover:text-gray-200"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>

          <div className="mt-6">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </div>
        </pre>
      )}
    </Highlight>
  );
}
