import { Clock } from 'lucide-react';
import type { RecipeStep } from '@/queries/useRecipe';
import { formatMinutes } from '@/utils/format';

export function StepList({ steps }: { steps: RecipeStep[] }) {
  if (!steps.length) {
    return <p className="text-sm text-body">This recipe has no steps yet.</p>;
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {steps.map((step) => (
        <li key={step.step_id} className="flex gap-3 leading-relaxed">
          {/* The numbered badge is v1's counter, drawn as a circle. */}
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white"
          >
            {step.step_number}
          </span>

          <div className="flex flex-1 flex-col gap-2">
            <p className="m-0 text-sm leading-relaxed text-body">{step.instruction}</p>

            {step.duration_minutes != null && (
              <span className="inline-flex w-fit items-center gap-1 font-mono text-xs text-muted">
                <Clock size={12} aria-hidden />
                {formatMinutes(step.duration_minutes)}
              </span>
            )}

            {step.image_url && (
              <img
                src={step.image_url}
                alt=""
                loading="lazy"
                className="mt-1 w-full max-w-md rounded-card border border-line-strong object-cover"
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
