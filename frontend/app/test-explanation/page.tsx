  import ExplanationRenderer from '@/components/quiz/ExplanationRenderer';

  export default function TestExplanationPage() {
    // Sample explanation blocks from your quiz
    const sampleExplanation = [
      {
        type: 'paragraph' as const,
        children: [
          { text: 'React — це саме ', bold: false },
          { text: 'бібліотека', bold: true },
          { text: ', а не фреймворк. Він фокусується на одній задачі: побудова UI.'
  },
        ],
      },
      {
        type: 'numberedList' as const,
        children: [
          {
            type: 'listItem' as const,
            children: [{ text: 'Перший пункт списку' }],
          },
          {
            type: 'listItem' as const,
            children: [{ text: 'Другий пункт списку' }],
          },
          {
            type: 'listItem' as const,
            children: [{ text: 'Третій пункт списку' }],
          },
        ],
      },
      {
        type: 'code' as const,
        language: 'javascript',
        children: [{ text: 'const [count, setCount] = useState(0);' }],
      },
      {
        type: 'paragraph' as const,
        children: [
          { text: 'Використовуйте ' },
          { text: 'useState', code: true },
          { text: ' для стану компонента.' },
        ],
      },
      {
        type: 'bulletList' as const,
        children: [
          {
            type: 'listItem' as const,
            children: [
              { text: 'Props', bold: true },
              { text: ' передаються від батьківського компонента' },
            ],
          },
          {
            type: 'listItem' as const,
            children: [
              { text: 'State', bold: true },
              { text: ' належить самому компоненту' },
            ],
          },
        ],
      },
    ];

    return (
      <div className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
            Тест ExplanationRenderer
          </h1>

          <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg border
  border-gray-200 dark:border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-gray-800
  dark:text-gray-200">
              Пояснення:
            </h2>
            <ExplanationRenderer blocks={sampleExplanation} />
          </div>
        </div>
      </div>
    );
  }