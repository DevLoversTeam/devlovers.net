import 'dotenv/config';

import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

import { db } from './index';
import { categories } from './schema/categories';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
  quizTranslations,
  quizzes,
} from './schema/quiz';

type Locale = 'uk' | 'en' | 'pl';

interface AnswerBlock {
  type: 'paragraph' | 'numberedList' | 'bulletList' | 'code';
  language?: string;
  children: AnswerBlockChild[];
}

interface AnswerBlockChild {
  type?: 'listItem';
  text?: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  children?: AnswerBlockChild[];
}

interface QuizQuestionSeed {
  displayOrder: number;
  difficulty: 'beginner' | 'medium' | 'advanced';
  sourceQuestionId?: string;
  content: Record<
    Locale,
    {
      questionText: string;
      explanation: AnswerBlock[];
    }
  >;
  answers: {
    displayOrder: number;
    isCorrect: boolean;
    translations: Record<Locale, string>;
  }[];
}

const QUIZ_ID = randomUUID();
const CATEGORY_SLUG = 'react';

const quizData = {
  id: QUIZ_ID,
  slug: 'react-fundamentals',
  displayOrder: 1,
  questionsCount: 5,
  timeLimitSeconds: 300,
  isActive: true,
};

const quizTranslationsData: Record<
  Locale,
  { title: string; description: string }
> = {
  uk: {
    title: 'Основи React',
    description:
      'Перевірте свої знання базових концепцій React: компоненти,Virtual DOM, JSX, props та state.',
  },
  en: {
    title: 'React Fundamentals',
    description:
      'Test your knowledge of React basics: components, Virtual DOM,JSX, props and state.',
  },
  pl: {
    title: 'Podstawy React',
    description:
      'Sprawdź swoją wiedzę o podstawach React: komponenty, Virtual DOM,JSX, props i state.',
  },
};

const questionsData: QuizQuestionSeed[] = [
  {
    displayOrder: 1,
    difficulty: 'beginner',
    content: {
      uk: {
        questionText: 'Що найточніше описує React?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'React — це саме ', bold: false },
              { text: 'бібліотека', bold: true },
              {
                text: ', а не фреймворк. Він фокусується на одній задачі: побудоваUI.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: 'На відміну від фреймворків (Angular, Vue), React не диктуєструктуру проєкту і дозволяє обирати інші інструменти для роутингу, стану тощо.',
              },
            ],
          },
        ],
      },
      en: {
        questionText: 'What best describes React?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'React is a ', bold: false },
              { text: 'library', bold: true },
              {
                text: ', not a framework. It focuses on one task: building UI.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: "Unlike frameworks (Angular, Vue), React doesn't dictate project structure and lets you choose other tools for routing, state management,etc.",
              },
            ],
          },
        ],
      },
      pl: {
        questionText: 'Co najlepiej opisuje React?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'React to ', bold: false },
              { text: 'biblioteka', bold: true },
              {
                text: ', a nie framework. Skupia się na jednym zadaniu: budowaniuUI.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: 'W przeciwieństwie do frameworków (Angular, Vue), React nienarzuca struktury projektu i pozwala wybierać inne narzędzia do routingu,zarządzania stanem itp.',
              },
            ],
          },
        ],
      },
    },
    answers: [
      {
        displayOrder: 1,
        isCorrect: false,
        translations: {
          uk: 'Повноцінний фреймворк для створення веб-додатків',
          en: 'A full-featured framework for building web applications',
          pl: 'Pełnoprawny framework do tworzenia aplikacji webowych',
        },
      },
      {
        displayOrder: 2,
        isCorrect: true,
        translations: {
          uk: 'JavaScript-бібліотека для створення користувацьких інтерфейсів',
          en: 'A JavaScript library for building user interfaces',
          pl: 'Biblioteka JavaScript do tworzenia interfejsów użytkownika',
        },
      },
      {
        displayOrder: 3,
        isCorrect: false,
        translations: {
          uk: 'Мова програмування для веб-розробки',
          en: 'A programming language for web development',
          pl: 'Język programowania do tworzenia stron internetowych',
        },
      },
      {
        displayOrder: 4,
        isCorrect: false,
        translations: {
          uk: 'База даних для зберігання даних додатків',
          en: 'A database for storing application data',
          pl: 'Baza danych do przechowywania danych aplikacji',
        },
      },
    ],
  },

  {
    displayOrder: 2,
    difficulty: 'beginner',
    content: {
      uk: {
        questionText: 'Навіщо React використовує Virtual DOM?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'Virtual DOM', bold: true },
              { text: " — це легка копія реального DOM в пам'яті." },
            ],
          },
          {
            type: 'numberedList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Коли щось змінюється, React спочатку оновлюєвіртуальну версію',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Порівнює її з попередньою (це називається"diffing")',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'Вносить лише мінімальні зміни в реальний DOM' },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'Це набагато швидше, ніж перемальовувати всю сторінку.' },
            ],
          },
        ],
      },
      en: {
        questionText: 'Why does React use Virtual DOM?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'Virtual DOM', bold: true },
              { text: ' is a lightweight copy of the real DOM in memory.' },
            ],
          },
          {
            type: 'numberedList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'When something changes, React first updates thevirtual version',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Compares it with the previous one (this iscalled "diffing")',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'Makes only minimal changes to the real DOM' },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'This is much faster than repainting the entire page.' },
            ],
          },
        ],
      },
      pl: {
        questionText: 'Dlaczego React używa Virtual DOM?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'Virtual DOM', bold: true },
              { text: ' to lekka kopia prawdziwego DOM w pamięci.' },
            ],
          },
          {
            type: 'numberedList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Gdy coś się zmienia, React najpierw aktualizuje wirtualną wersję',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Porównuje ją z poprzednią (nazywa się to"diffing")',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Wprowadza tylko minimalne zmiany do prawdziwego DOM',
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'To znacznie szybsze niż przemalowywanie całej strony.' },
            ],
          },
        ],
      },
    },
    answers: [
      {
        displayOrder: 1,
        isCorrect: false,
        translations: {
          uk: 'Щоб зберігати дані користувача в браузері',
          en: 'To store user data in the browser',
          pl: 'Aby przechowywać dane użytkownika w przeglądarce',
        },
      },
      {
        displayOrder: 2,
        isCorrect: true,
        translations: {
          uk: 'Для ефективного оновлення інтерфейсу без зайвих маніпуляцій з реальним DOM',
          en: 'For efficient UI updates without unnecessary real DOM manipulations',
          pl: 'Do efektywnych aktualizacji UI bez zbędnych manipulacji prawdziwymDOM',
        },
      },
      {
        displayOrder: 3,
        isCorrect: false,
        translations: {
          uk: 'Для створення анімацій на сторінці',
          en: 'To create animations on the page',
          pl: 'Do tworzenia animacji na stronie',
        },
      },
      {
        displayOrder: 4,
        isCorrect: false,
        translations: {
          uk: 'Щоб сторінка працювала без JavaScript',
          en: 'So the page works without JavaScript',
          pl: 'Aby strona działała bez JavaScript',
        },
      },
    ],
  },

  {
    displayOrder: 3,
    difficulty: 'beginner',
    content: {
      uk: {
        questionText: 'Що повертає хук useState?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [{ text: 'const [count, setCount] = useState(0);' }],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'Це ', bold: false },
              { text: 'деструктуризація масиву', bold: true },
              {
                text: '. Перший елемент — поточне значення, другий —функція-сетер.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'Імена можна обирати будь-які, але конвенція: ' },
              { text: 'value', code: true },
              { text: ' і ' },
              { text: 'setValue', code: true },
              { text: '.' },
            ],
          },
        ],
      },
      en: {
        questionText: 'What does the useState hook return?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [{ text: 'const [count, setCount] = useState(0);' }],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'This is ', bold: false },
              { text: 'array destructuring', bold: true },
              {
                text: '. The first element is the current value, the second is thesetter function.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'You can choose any names, but the convention is: ' },
              { text: 'value', code: true },
              { text: ' and ' },
              { text: 'setValue', code: true },
              { text: '.' },
            ],
          },
        ],
      },
      pl: {
        questionText: 'Co zwraca hook useState?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [{ text: 'const [count, setCount] = useState(0);' }],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'To ', bold: false },
              { text: 'destrukturyzacja tablicy', bold: true },
              {
                text: '. Pierwszy element to aktualna wartość, drugi to funkcjasetter.',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'Możesz wybrać dowolne nazwy, ale konwencja to: ' },
              { text: 'value', code: true },
              { text: ' i ' },
              { text: 'setValue', code: true },
              { text: '.' },
            ],
          },
        ],
      },
    },
    answers: [
      {
        displayOrder: 1,
        isCorrect: false,
        translations: {
          uk: 'Тільки поточне значення стану',
          en: 'Only the current state value',
          pl: 'Tylko aktualną wartość stanu',
        },
      },
      {
        displayOrder: 2,
        isCorrect: true,
        translations: {
          uk: 'Масив з двох елементів: поточне значення і функцію для його зміни',
          en: 'An array of two elements: current value and a function to changeit',
          pl: 'Tablicę dwóch elementów: aktualną wartość i funkcję do jej zmiany',
        },
      },
      {
        displayOrder: 3,
        isCorrect: false,
        translations: {
          uk: "Об'єкт з методами get і set",
          en: 'An object with get and set methods',
          pl: 'Obiekt z metodami get i set',
        },
      },
      {
        displayOrder: 4,
        isCorrect: false,
        translations: {
          uk: 'Promise з новим значенням',
          en: 'A Promise with the new value',
          pl: 'Promise z nową wartością',
        },
      },
    ],
  },

  {
    displayOrder: 4,
    difficulty: 'medium',
    content: {
      uk: {
        questionText: 'Що означає порожній масив залежностей [] у useEffect?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [
              {
                text: 'useEffect(() => {\n  console.log("Виконається один раз");\n}, []);',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'Це аналог ' },
              { text: 'componentDidMount', code: true },
              { text: ' з класових компонентів.' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Порожній масив каже React: "цей ефект незалежить від жодних значень"',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Без масиву — ефект запускається після кожногорендеру',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'З залежностями [a, b] — ефект запускається при зміні a або b',
                  },
                ],
              },
            ],
          },
        ],
      },
      en: {
        questionText:
          'What does an empty dependency array [] in useEffect mean?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [
              {
                text: 'useEffect(() => {\n  console.log("Runs once");\n}, []);',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'This is equivalent to ' },
              { text: 'componentDidMount', code: true },
              { text: ' from class components.' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Empty array tells React: "this effect doesn\'tdepend on any values"',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'Without array — effect runs after every render' },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'With dependencies [a, b] — effect runs when aor b changes',
                  },
                ],
              },
            ],
          },
        ],
      },
      pl: {
        questionText: 'Co oznacza pusta tablica zależności [] w useEffect?',
        explanation: [
          {
            type: 'code',
            language: 'javascript',
            children: [
              {
                text: 'useEffect(() => {\n  console.log("Uruchomi się raz");\n},[]);',
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              { text: 'To odpowiednik ' },
              { text: 'componentDidMount', code: true },
              { text: ' z komponentów klasowych.' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Pusta tablica mówi React: "ten efekt nie zależy od żadnych wartości"',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Bez tablicy — efekt uruchamia się po każdymrenderze',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  {
                    text: 'Z zależnościami [a, b] — efekt uruchamia sięgdy zmienia się a lub b',
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    answers: [
      {
        displayOrder: 1,
        isCorrect: false,
        translations: {
          uk: 'Ефект ніколи не виконається',
          en: 'The effect will never run',
          pl: 'Efekt nigdy się nie uruchomi',
        },
      },
      {
        displayOrder: 2,
        isCorrect: true,
        translations: {
          uk: 'Ефект виконається лише один раз після першого рендеру',
          en: 'The effect will run only once after the first render',
          pl: 'Efekt uruchomi się tylko raz po pierwszym renderze',
        },
      },
      {
        displayOrder: 3,
        isCorrect: false,
        translations: {
          uk: 'Ефект виконуватиметься на кожному рендері',
          en: 'The effect will run on every render',
          pl: 'Efekt będzie uruchamiany przy każdym renderze',
        },
      },
      {
        displayOrder: 4,
        isCorrect: false,
        translations: {
          uk: 'Це синтаксична помилка',
          en: 'This is a syntax error',
          pl: 'To błąd składniowy',
        },
      },
    ],
  },

  {
    displayOrder: 5,
    difficulty: 'beginner',
    content: {
      uk: {
        questionText: 'Чим state відрізняється від props?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'State', bold: true },
              { text: ' — це "пам\'ять" компонента. На відміну від props:' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  { text: 'Props', bold: true },
                  {
                    text: ' передаються від батьківського компонента (read-only)',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'State', bold: true },
                  { text: ' належить самому компоненту і може змінюватися' },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: 'Коли state змінюється — компонент перерендерюєтьсяавтоматично.',
              },
            ],
          },
        ],
      },
      en: {
        questionText: 'How does state differ from props?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'State', bold: true },
              { text: ' is the component\'s "memory". Unlike props:' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  { text: 'Props', bold: true },
                  { text: ' are passed from the parent component (read-only)' },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'State', bold: true },
                  {
                    text: ' belongs to the component itself and can be changed',
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: 'When state changes — the component re-renders automatically.',
              },
            ],
          },
        ],
      },
      pl: {
        questionText: 'Czym state różni się od props?',
        explanation: [
          {
            type: 'paragraph',
            children: [
              { text: 'State', bold: true },
              { text: ' to "pamięć" komponentu. W przeciwieństwie do props:' },
            ],
          },
          {
            type: 'bulletList',
            children: [
              {
                type: 'listItem',
                children: [
                  { text: 'Props', bold: true },
                  {
                    text: ' są przekazywane od komponentu nadrzędnego (tylko doodczytu)',
                  },
                ],
              },
              {
                type: 'listItem',
                children: [
                  { text: 'State', bold: true },
                  { text: ' należy do samego komponentu i może być zmieniany' },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                text: 'Gdy state się zmienia — komponent renderuje się automatycznie ponownie.',
              },
            ],
          },
        ],
      },
    },
    answers: [
      {
        displayOrder: 1,
        isCorrect: false,
        translations: {
          uk: 'State передається від батьківського компонента',
          en: 'State is passed from the parent component',
          pl: 'State jest przekazywany od komponentu nadrzędnego',
        },
      },
      {
        displayOrder: 2,
        isCorrect: true,
        translations: {
          uk: 'State — це внутрішні дані компонента, які він може змінювати',
          en: "State is the component's internal data that it can modify",
          pl: 'State to wewnętrzne dane komponentu, które może modyfikować',
        },
      },
      {
        displayOrder: 3,
        isCorrect: false,
        translations: {
          uk: 'State не впливає на рендеринг компонента',
          en: 'State does not affect component rendering',
          pl: 'State nie wpływa na renderowanie komponentu',
        },
      },
      {
        displayOrder: 4,
        isCorrect: false,
        translations: {
          uk: 'State доступний тільки в класових компонентах',
          en: 'State is only available in class components',
          pl: 'State jest dostępny tylko w komponentach klasowych',
        },
      },
    ],
  },
];

async function seedReactQuiz() {
  console.log('Starting React quiz seed...');

  const locales: Locale[] = ['uk', 'en', 'pl'];

  try {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, CATEGORY_SLUG))
      .limit(1);

    if (!category) {
      throw new Error(
        `Category "${CATEGORY_SLUG}" not found. Run seed:categories first.`
      );
    }

    console.log('Creating quiz...');
    await db
      .insert(quizzes)
      .values({
        ...quizData,
        categoryId: category.id,
      })
      .onConflictDoNothing();

    console.log('Creating quiz translations...');
    for (const locale of locales) {
      await db
        .insert(quizTranslations)
        .values({
          quizId: QUIZ_ID,
          locale,
          title: quizTranslationsData[locale].title,
          description: quizTranslationsData[locale].description,
        })
        .onConflictDoNothing();
    }

    console.log('Creating questions...');
    for (const question of questionsData) {
      const questionId = randomUUID();

      await db
        .insert(quizQuestions)
        .values({
          id: questionId,
          quizId: QUIZ_ID,
          displayOrder: question.displayOrder,
          difficulty: question.difficulty,
          sourceQuestionId: question.sourceQuestionId ?? null,
        })
        .onConflictDoNothing();

      for (const locale of locales) {
        await db
          .insert(quizQuestionContent)
          .values({
            quizQuestionId: questionId,
            locale,
            questionText: question.content[locale].questionText,
            explanation: question.content[locale].explanation,
          })
          .onConflictDoNothing();
      }

      for (const answer of question.answers) {
        const answerId = randomUUID();

        await db
          .insert(quizAnswers)
          .values({
            id: answerId,
            quizQuestionId: questionId,
            displayOrder: answer.displayOrder,
            isCorrect: answer.isCorrect,
          })
          .onConflictDoNothing();

        for (const locale of locales) {
          await db
            .insert(quizAnswerTranslations)
            .values({
              quizAnswerId: answerId,
              locale,
              answerText: answer.translations[locale],
            })
            .onConflictDoNothing();
        }
      }
    }

    console.log('React quiz seeded successfully!');
    console.log(`   - 1 quiz with ${locales.length} translations`);
    console.log(
      `   - ${questionsData.length} questions with ${locales.length} translations each`
    );
    console.log(
      `   - ${questionsData.length * 4} answers with ${
        locales.length
      } translations each`
    );
  } catch (error) {
    console.error('Error seeding quiz:', error);
    throw error;
  }
}

async function cleanupReactQuiz() {
  console.log('🧹 Cleaning up React quiz...');

  await db.delete(quizAnswerTranslations);
  await db.delete(quizAnswers);
  await db.delete(quizQuestionContent);
  await db.delete(quizQuestions);
  await db.delete(quizTranslations);
  await db.delete(quizzes);

  console.log('Cleanup complete!');
}

seedReactQuiz()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// cleanupReactQuiz()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
