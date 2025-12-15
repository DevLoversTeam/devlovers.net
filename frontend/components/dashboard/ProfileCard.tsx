import { User } from 'lucide-react'; 


interface ProfileCardProps {
  user: {
    name: string | null;
    email: string;
    role: string | null;
    points: number;
    createdAt: Date | null;
  };
}

export function ProfileCard({ user }: ProfileCardProps) {

  const cardStyles = `
    relative overflow-hidden rounded-[2rem]
    border border-slate-200/70 dark:border-slate-700/80
    bg-white/60 dark:bg-slate-900/60 backdrop-blur-md
    shadow-[0_18px_45px_rgba(15,23,42,0.05)]
    dark:shadow-[0_22px_60px_rgba(0,0,0,0.2)]
    p-8 transition-all hover:border-sky-200 dark:hover:border-sky-800
  `;

  return (
    <div className={cardStyles}>
      <div className="flex items-start gap-6">
    
        <div className="relative p-[3px] rounded-full bg-gradient-to-br from-sky-400 to-pink-400">
          <div className="h-20 w-20 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-3xl font-bold text-slate-700 dark:text-slate-200">
            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
          </div>
        </div>

        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {user.name || 'Developer'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-mono">
            {user.email}
          </p>

          <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
            {user.role || 'user'}
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/50 grid grid-cols-2 gap-6">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Points
          </span>
          <div className="text-3xl font-black text-slate-800 dark:text-white mt-1">
            {user.points}
          </div>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Joined
          </span>
          <div className="text-lg font-medium text-slate-700 dark:text-slate-300 mt-2">
            {user.createdAt
              ? new Date(user.createdAt).toLocaleDateString('uk-UA')
              : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
