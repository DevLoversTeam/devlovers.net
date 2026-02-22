'use client';

import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  type JsonQuestion,
  jsonQuestionsFileSchema,
} from '@/lib/validation/admin-quiz';

interface UploadedFile {
  name: string;
  questions: JsonQuestion[];
  error?: string;
}

interface JsonUploadAreaProps {
  onQuestionsChange: (questions: JsonQuestion[]) => void;
}

export function JsonUploadArea({ onQuestionsChange }: JsonUploadAreaProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateParent(updatedFiles: UploadedFile[]) {
    const merged = updatedFiles.flatMap(f => f.questions);
    onQuestionsChange(merged);
  }

  async function handleFiles(fileList: FileList) {
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.json')) {
        newFiles.push({
          name: file.name,
          questions: [],
          error: 'Not a .json file',
        });
        continue;
      }

      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        const parsed = jsonQuestionsFileSchema.safeParse(raw);

        if (!parsed.success) {
          const issues = parsed.error.issues
            .slice(0, 3)
            .map(i => i.message)
            .join('; ');
          newFiles.push({ name: file.name, questions: [], error: issues });
        } else {
          newFiles.push({ name: file.name, questions: parsed.data.questions });
        }
      } catch {
        newFiles.push({
          name: file.name,
          questions: [],
          error: 'Invalid JSON',
        });
      }
    }

    const updated = [...files, ...newFiles];
    setFiles(updated);
    updateParent(updated);

    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(index: number) {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    updateParent(updated);
  }

  return (
    <div className="space-y-3">
      <label className="text-foreground text-sm font-medium">
        Questions (JSON files)
      </label>

      <div
        className="border-border hover:border-foreground/30 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors"
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          multiple
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <p className="text-muted-foreground text-sm">
          Click to upload .json files
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Each file must contain {`{ "questions": [...] }`}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className={cn(
                'border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                f.error ? 'border-red-500/50 bg-red-500/5' : 'bg-muted/50'
              )}
            >
              <div className="min-w-0 flex-1">
                <span className="text-foreground font-medium">{f.name}</span>
                {f.error ? (
                  <span className="ml-2 text-xs text-red-500">{f.error}</span>
                ) : (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {f.questions.length} questions
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-foreground ml-2 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
