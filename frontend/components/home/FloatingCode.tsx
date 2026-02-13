'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface CodeSnippet {
  id: string;
  code: string;
  language: string;
  position: { x: string; y: string };
  rotate: number;
  delay: number;
  color: string;
}

const snippets: CodeSnippet[] = [
  {
    id: 'react-hook',
    code: 'useEffect(() => {\n  fetchData();\n}, []);',
    language: 'react',
    position: { x: '12%', y: '25%' },
    rotate: -6,
    delay: 0,
    color: '#61DAFB',
  },
  {
    id: 'css-grid',
    code: '.grid {\n  display: grid;\n  gap: 1rem;\n}',
    language: 'css',
    position: { x: '8%', y: '55%' },
    rotate: 3,
    delay: 0.2,
    color: '#1572B6',
  },
  {
    id: 'git-cmd',
    code: 'git commit -m\n"feat: init"',
    language: 'shell',
    position: { x: '15%', y: '80%' },
    rotate: -4,
    delay: 0.4,
    color: '#F05032',
  },
  {
    id: 'ts-interface',
    code: 'interface User {\n  id: number;\n  name: string;\n}',
    language: 'typescript',
    position: { x: '88%', y: '20%' },
    rotate: 5,
    delay: 0.1,
    color: '#3178C6',
  },
  {
    id: 'sql-query',
    code: 'SELECT * FROM\nusers WHERE\nactive = true;',
    language: 'sql',
    position: { x: '92%', y: '50%' },
    rotate: -3,
    delay: 0.3,
    color: '#e34c26',
  },
  {
    id: 'js-async',
    code: 'const data =\nawait api.get();',
    language: 'javascript',
    position: { x: '85%', y: '75%' },
    rotate: 4,
    delay: 0.5,
    color: '#F7DF1E',
  },
];

function CodeBlock({ snippet }: { snippet: CodeSnippet }) {
  const [displayedCode, setDisplayedCode] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Refs for cleanup
  const typeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let currentIndex = 0;
    const code = snippet.code;
    const typingSpeed = 50 + Math.random() * 30; 

    const startTyping = () => {
      setIsTyping(true);
      setDisplayedCode('');
      currentIndex = 0;

      // Clear any existing interval just in case
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);

      typeIntervalRef.current = setInterval(() => {
        if (currentIndex < code.length) {
          setDisplayedCode(code.substring(0, currentIndex + 1));
          currentIndex++;
        } else {
          if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
          setIsTyping(false);
          
          resetTimeoutRef.current = setTimeout(() => {
            setDisplayedCode('');
            startTimeoutRef.current = setTimeout(startTyping, 1000 + Math.random() * 2000);
          }, 4000 + Math.random() * 2000); 
        }
      }, typingSpeed);
    };

    initialTimeoutRef.current = setTimeout(startTyping, snippet.delay * 1000);

    return () => {
      if (initialTimeoutRef.current) clearTimeout(initialTimeoutRef.current);
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    };
  }, [snippet.code, snippet.delay]);

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto select-none"      
      style={{
        left: snippet.position.x,
        top: snippet.position.y,
      }}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ 
        opacity: 0.7,
        scale: 1,
        y: 0,
      }}
      whileHover={{ 
        scale: 1.1,
        opacity: 1,
        zIndex: 50,
      }}
      transition={{
        duration: 0.8,
        delay: snippet.delay,
        ease: 'easeOut',
      }}
    >
      <motion.div
        className="relative overflow-hidden rounded-lg border bg-white/80 p-3 backdrop-blur-md dark:bg-gray-950/60" 
        style={{
          borderColor: `${snippet.color}30`,
          boxShadow: `0 8px 32px -4px ${snippet.color}15`, 
        }}
        animate={{
          y: [0, -12, 0],
          rotate: [snippet.rotate, snippet.rotate + 2, snippet.rotate],
        }}
        transition={{
          duration: 5 + Math.random() * 3, 
          repeat: Infinity,
          ease: 'easeInOut',
          delay: snippet.delay,
        }}
      >
        <pre className="font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
          <code>
            {displayedCode.split('\n').map((line, i) => (
              <div key={i} className="flex min-h-[1.5em]">
                <span className="mr-3 w-3 select-none text-right opacity-30 text-xs">{i + 1}</span>
                <span 
                  style={{ 
                    color: i === 0 ? snippet.color : 'inherit',
                    textShadow: i === 0 ? `0 0 10px ${snippet.color}40` : 'none',
                    fontWeight: i === 0 ? 600 : 400,
                  }}
                >
                  {line}
                  {i === displayedCode.split('\n').length - 1 && (
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      className="ml-0.5 inline-block h-3 w-1.5 align-middle bg-current opacity-70"
                    />
                  )}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </motion.div>
    </motion.div>
  );
}

export function FloatingCode() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block overflow-hidden" aria-hidden="true">
      {snippets.map((snippet) => (
        <CodeBlock key={snippet.id} snippet={snippet} />
      ))}
    </div>
  );
}
