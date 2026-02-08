import { Loader } from '@/components/shared/Loader';

export default function QuizLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
      <Loader size={200} />
    </div>
  );
}
