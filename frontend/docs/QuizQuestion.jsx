import { useState, useEffect, useReducer, useCallback } from 'react';

// Anti-cheat hook
function useAntiCheat() {
  const [violations, setViolations] = useState([]);
  const [isTabActive, setIsTabActive] = useState(true);
  const [showWarning, setShowWarning] = useState(null);

  useEffect(() => {
    const handleCopy = (e) => {
      e.preventDefault();
      setViolations(prev => [...prev, 'copy']);
      setShowWarning('Копіювання вимкнено під час проходження квізу');
      setTimeout(() => setShowWarning(null), 3000);
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
      setViolations(prev => [...prev, 'context_menu']);
      setShowWarning('Контекстне меню вимкнено');
      setTimeout(() => setShowWarning(null), 2000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsTabActive(false);
        setViolations(prev => [...prev, 'tab_switch']);
        setShowWarning('Ви залишили сторінку квізу');
        setTimeout(() => setShowWarning(null), 5000);
      } else {
        setIsTabActive(true);
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { violations, isTabActive, showWarning };
}

// Mock data matching the screenshot
const mockQuestions = [
  {
    id: 'q1',
    number: '3.8.',
    text: 'Що таке мінімальний розріз у контексті алгоритмів мережевих потоків?',
    answers: [
      { id: 'a1', text: 'Найкоротший шлях від джерела до стоку в розгалуженому графі', isCorrect: false },
      { id: 'a2', text: 'Множина ребер з мінімальною сумарною пропускною здатністю, видалення яких відділяє стік від джерела', isCorrect: true },
      { id: 'a3', text: 'Множина вершин в розгалуженому графу з максимальною сумарною пропускною здатністю', isCorrect: false },
      { id: 'a4', text: 'Найдовший шлях від джерела до стоку в розгалуженому графі', isCorrect: false },
    ],
    explanation: 'Правильно! Мінімальний розріз — це множина ребер з мінімальною сумарною пропускною здатністю, видалення яких розділяє граф на дві частини: одна містить джерело, а інша — сток.',
  },
  {
    id: 'q2',
    number: '3.9.',
    text: 'Яка часова складність алгоритму Едмондса-Карпа для пошуку максимального потоку?',
    answers: [
      { id: 'b1', text: 'O(V × E²)', isCorrect: true },
      { id: 'b2', text: 'O(V²)', isCorrect: false },
      { id: 'b3', text: 'O(E × log V)', isCorrect: false },
      { id: 'b4', text: 'O(V³)', isCorrect: false },
    ],
    explanation: 'Алгоритм Едмондса-Карпа має часову складність O(V × E²), де V — кількість вершин, E — кількість ребер.',
  },
  {
    id: 'q3',
    number: '3.10.',
    text: 'Що гарантує теорема Форда-Фалкерсона?',
    answers: [
      { id: 'c1', text: 'Максимальний потік дорівнює мінімальному розрізу', isCorrect: true },
      { id: 'c2', text: 'Кожен граф має унікальний максимальний потік', isCorrect: false },
      { id: 'c3', text: 'Алгоритм завжди завершується за поліноміальний час', isCorrect: false },
      { id: 'c4', text: 'Існує щонайменше один шлях від джерела до стоку', isCorrect: false },
    ],
    explanation: 'Теорема Форда-Фалкерсона (max-flow min-cut theorem) стверджує, що максимальний потік у мережі дорівнює пропускній здатності мінімального розрізу.',
  },
];

// Quiz state reducer
const initialState = {
  status: 'answering',
  currentIndex: 0,
  answers: [],
  score: 0,
};

function quizReducer(state, action) {
  switch (action.type) {
    case 'SELECT_ANSWER':
      return {
        ...state,
        status: 'revealed',
        answers: [...state.answers, {
          questionId: action.questionId,
          answerId: action.answerId,
          isCorrect: action.isCorrect,
        }],
        score: action.isCorrect ? state.score + 1 : state.score,
      };
    case 'NEXT_QUESTION':
      return {
        ...state,
        status: state.currentIndex + 1 >= mockQuestions.length ? 'completed' : 'answering',
        currentIndex: state.currentIndex + 1,
      };
    case 'RESTART':
      return initialState;
    default:
      return state;
  }
}

// Icons
function CheckIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CircleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

// Progress component
function QuizProgress({ current, total, answers }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      marginBottom: '32px',
    }}>
      {Array.from({ length: total }, (_, i) => {
        const answer = answers[i];
        const isCurrent = i === current - 1;
        const isPast = i < current - 1;
        
        let bgColor = 'var(--bg-secondary)';
        let borderColor = 'transparent';
        
        if (answer) {
          bgColor = answer.isCorrect ? 'var(--success)' : 'var(--error)';
        }
        if (isCurrent) {
          borderColor = 'var(--accent)';
        }
        
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: bgColor,
              border: `2px solid ${borderColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: '600',
              color: answer ? 'white' : 'var(--text-secondary)',
              transition: 'all 200ms ease',
            }}>
              {i + 1}
            </div>
            {i < total - 1 && (
              <div style={{
                width: '24px',
                height: '2px',
                backgroundColor: isPast ? (answers[i]?.isCorrect ? 'var(--success)' : 'var(--error)') : 'var(--border)',
                transition: 'background-color 200ms ease',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Question component
function QuizQuestion({ question, status, selectedAnswerId, onAnswer, onNext }) {
  const [isLocked, setIsLocked] = useState(false);
  
  useEffect(() => {
    setIsLocked(false);
  }, [question.id]);
  
  const handleClick = (answerId) => {
    if (isLocked || status !== 'answering') return;
    setIsLocked(true);
    onAnswer(answerId);
  };
  
  const getAnswerStyle = (answer) => {
    const base = {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '16px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      textAlign: 'left',
      cursor: status === 'answering' ? 'pointer' : 'default',
      transition: 'all 150ms ease',
      width: '100%',
      fontSize: '15px',
      lineHeight: '1.5',
      color: 'var(--text-primary)',
    };
    
    if (status !== 'revealed') {
      return base;
    }
    
    if (answer.id === selectedAnswerId) {
      return {
        ...base,
        borderColor: answer.isCorrect ? 'var(--success)' : 'var(--error)',
        backgroundColor: answer.isCorrect 
          ? 'rgba(52, 199, 89, 0.08)' 
          : 'rgba(255, 59, 48, 0.08)',
      };
    }
    
    if (answer.isCorrect) {
      return {
        ...base,
        borderColor: 'var(--success)',
      };
    }
    
    return base;
  };
  
  const getIndicator = (answer) => {
    if (status !== 'revealed') {
      return <CircleIcon />;
    }
    
    if (answer.id === selectedAnswerId) {
      return answer.isCorrect 
        ? <CheckIcon /> 
        : <XIcon />;
    }
    
    if (answer.isCorrect) {
      return <CheckIcon />;
    }
    
    return <CircleIcon />;
  };
  
  const getIndicatorColor = (answer) => {
    if (status !== 'revealed') return 'var(--text-secondary)';
    if (answer.id === selectedAnswerId) {
      return answer.isCorrect ? 'var(--success)' : 'var(--error)';
    }
    if (answer.isCorrect) return 'var(--success)';
    return 'var(--text-secondary)';
  };
  
  return (
    <article style={{ maxWidth: '640px', margin: '0 auto' }}>
      <header style={{ marginBottom: '24px' }}>
        <span style={{
          display: 'block',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
        }}>
          {question.number}
        </span>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          lineHeight: '1.4',
          margin: 0,
        }}>
          {question.text}
        </h2>
      </header>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {question.answers.map((answer) => (
          <button
            key={answer.id}
            onClick={() => handleClick(answer.id)}
            disabled={status === 'revealed'}
            style={getAnswerStyle(answer)}
            onMouseEnter={(e) => {
              if (status === 'answering') {
                e.currentTarget.style.borderColor = 'var(--accent)';
              }
            }}
            onMouseLeave={(e) => {
              if (status === 'answering') {
                e.currentTarget.style.borderColor = 'var(--border)';
              }
            }}
          >
            <span style={{
              flexShrink: 0,
              color: getIndicatorColor(answer),
              display: 'flex',
              alignItems: 'center',
              marginTop: '2px',
            }}>
              {getIndicator(answer)}
            </span>
            <span>{answer.text}</span>
          </button>
        ))}
      </div>
      
      {status === 'revealed' && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: 'rgba(52, 199, 89, 0.08)',
          borderRadius: '12px',
          animation: 'fadeIn 250ms ease',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            color: 'var(--success)',
            marginBottom: '8px',
          }}>
            <CheckIcon size={16} />
            <span>Результат</span>
          </div>
          <p style={{
            fontSize: '15px',
            color: 'var(--text-primary)',
            lineHeight: '1.5',
            margin: 0,
          }}>
            {question.explanation}
          </p>
        </div>
      )}
      
      {status === 'revealed' && (
        <button
          onClick={onNext}
          style={{
            width: '100%',
            marginTop: '24px',
            padding: '14px',
            backgroundColor: 'var(--accent)',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'background-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
        >
          Далі
        </button>
      )}
    </article>
  );
}

// Result component
function QuizResult({ score, total, onRestart }) {
  const percentage = Math.round((score / total) * 100);
  const getMessage = () => {
    if (percentage >= 90) return 'Відмінний результат!';
    if (percentage >= 70) return 'Чудовий результат!';
    if (percentage >= 50) return 'Непоганий результат';
    return 'Варто повторити матеріал';
  };
  
  return (
    <div style={{
      maxWidth: '400px',
      margin: '0 auto',
      textAlign: 'center',
      padding: '48px 24px',
    }}>
      <div style={{
        fontSize: '64px',
        fontWeight: '700',
        color: 'var(--text-primary)',
        marginBottom: '8px',
      }}>
        {score}/{total}
      </div>
      
      <p style={{
        fontSize: '20px',
        color: 'var(--text-secondary)',
        marginBottom: '32px',
      }}>
        {getMessage()}
      </p>
      
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '32px',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: percentage >= 70 ? 'var(--success)' : 'var(--error)',
          borderRadius: '4px',
          transition: 'width 500ms ease',
        }} />
      </div>
      
      <div style={{
        padding: '16px',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '12px',
        marginBottom: '24px',
      }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Ваша позиція
        </div>
        <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>
          #42
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Серед 1,247 учасників
        </div>
      </div>
      
      <button
        onClick={onRestart}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: 'var(--accent)',
          color: 'white',
          fontSize: '16px',
          fontWeight: '600',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--accent)';
        }}
      >
        Спробувати ще раз
      </button>
    </div>
  );
}

// Theme toggle
function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        transition: 'background-color 150ms ease',
      }}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}

// Main app
export default function QuizApp() {
  const [theme, setTheme] = useState('light');
  const [state, dispatch] = useReducer(quizReducer, initialState);
  const { violations, isTabActive, showWarning } = useAntiCheat();
  
  const currentQuestion = mockQuestions[state.currentIndex];
  
  const handleAnswer = (answerId) => {
    const answer = currentQuestion.answers.find(a => a.id === answerId);
    if (!answer) return;
    
    dispatch({
      type: 'SELECT_ANSWER',
      questionId: currentQuestion.id,
      answerId,
      isCorrect: answer.isCorrect,
    });
  };
  
  const handleNext = () => {
    dispatch({ type: 'NEXT_QUESTION' });
  };
  
  const handleRestart = () => {
    dispatch({ type: 'RESTART' });
  };
  
  const cssVars = theme === 'dark' ? {
    '--bg-primary': '#000000',
    '--bg-secondary': '#1c1c1e',
    '--bg-card': '#1c1c1e',
    '--text-primary': '#f5f5f7',
    '--text-secondary': '#8e8e93',
    '--accent': '#0a84ff',
    '--accent-hover': '#409cff',
    '--success': '#30d158',
    '--error': '#ff453a',
    '--border': '#38383a',
  } : {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f5f5f7',
    '--bg-card': '#ffffff',
    '--text-primary': '#1d1d1f',
    '--text-secondary': '#6e6e73',
    '--accent': '#007aff',
    '--accent-hover': '#0056b3',
    '--success': '#34c759',
    '--error': '#ff3b30',
    '--border': '#d2d2d7',
  };
  
  return (
    <div style={{
      ...cssVars,
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
      padding: '48px 24px',
      transition: 'background-color 250ms ease',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media print {
          body { display: none !important; }
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
      `}</style>
      
      {/* Warning Toast */}
      {showWarning && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          backgroundColor: 'var(--error)',
          color: 'white',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 1000,
          animation: 'slideIn 200ms ease',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}>
          ⚠️ {showWarning}
        </div>
      )}
      
      {/* Tab inactive overlay */}
      {!isTabActive && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
        }}>
          <div style={{
            color: 'white',
            fontSize: '24px',
            fontWeight: '600',
            textAlign: 'center',
          }}>
            ⚠️ Поверніться до квізу
          </div>
        </div>
      )}
      
      {/* Violations counter (dev info) */}
      {violations.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          padding: '8px 12px',
          backgroundColor: 'var(--error)',
          color: 'white',
          borderRadius: '6px',
          fontSize: '12px',
          opacity: 0.8,
        }}>
          Порушень: {violations.length}
        </div>
      )}
      
      <ThemeToggle 
        theme={theme} 
        onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} 
      />
      
      <header style={{
        textAlign: 'center',
        marginBottom: '32px',
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
        }}>
          Алгоритми мережевих потоків
        </h1>
        <p style={{
          fontSize: '15px',
          color: 'var(--text-secondary)',
          margin: 0,
        }}>
          Перевірте свої знання алгоритмів
        </p>
      </header>
      
      {state.status === 'completed' ? (
        <QuizResult
          score={state.score}
          total={mockQuestions.length}
          onRestart={handleRestart}
        />
      ) : (
        <>
          <QuizProgress
            current={state.currentIndex + 1}
            total={mockQuestions.length}
            answers={state.answers}
          />
          
          <QuizQuestion
            question={currentQuestion}
            status={state.status}
            selectedAnswerId={state.answers[state.currentIndex]?.answerId}
            onAnswer={handleAnswer}
            onNext={handleNext}
          />
        </>
      )}
    </div>
  );
}
