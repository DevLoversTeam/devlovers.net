'use client';

import { Highlight, themes } from 'prism-react-renderer';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

type Props = {
  code: string;
  language?: string | null;
};

export default function CodeBlock({ code, language }: Props) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  const theme = resolvedTheme === 'dark' ? themes.nightOwl : themes.vsLight;

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
          className={`${className} relative rounded-lg p-4 text-sm overflow-x-auto`}
          style={style}
        >
          {language && (
            <div className="absolute left-3 top-2 text-xs uppercase text-gray-400 font-mono">
              {language}
            </div>
          )}

          <button
            onClick={handleCopy}
            aria-label="Copy code"
            className="absolute right-3 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs
              text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
              bg-white/70 dark:bg-black/40 backdrop-blur
              transition-colors cursor-pointer"
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
