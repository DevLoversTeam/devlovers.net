import { Badge } from '@/components/ui/badge';

export function getQuizProgressStatus(percentage: number) {
  if (percentage === 100) {
    return {
      variant: 'success',
      label: 'mastered',
      dotColor: 'bg-emerald-500',
    } as const;
  }

  if (percentage >= 70) {
    return {
      variant: 'warning',
      label: 'needsReview',
      dotColor: 'bg-amber-500',
    } as const;
  }

  return { variant: 'danger', label: 'study', dotColor: 'bg-red-500' } as const;
}

export function QuizProgressBadge({
  status,
  label,
  className = 'gap-1.5 rounded-full',
}: {
  status: ReturnType<typeof getQuizProgressStatus>;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant={status.variant} className={className}>
      <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
      {label}
    </Badge>
  );
}
