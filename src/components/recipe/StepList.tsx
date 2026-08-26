import { Clock } from 'lucide-react';
import type { RecipeStep } from '@/queries/useRecipe';
import { formatMinutes } from '@/utils/format';

export function StepList({ steps }: { steps: RecipeStep[] }) {
  if (!steps.length) {
    return <p className="text-sm text-ceniza">Esta receta todavía no tiene pasos.</p>;
  }

  return (
    <ol className="flex flex-col">
      {steps.map((step) => (
        <li
          key={step.step_id}
          className="grid grid-cols-[2.5rem_1fr] gap-3 border-b border-ceniza/15 py-4 last:border-b-0"
        >
          <span className="font-mono text-lg text-ceniza/60">
            {String(step.step_number).padStart(2, '0')}
          </span>

          <div className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed text-comal">{step.instruction}</p>

            {step.duration_minutes != null && (
              <span className="inline-flex w-fit items-center gap-1 font-mono text-xs text-ceniza">
                <Clock size={12} aria-hidden />
                {formatMinutes(step.duration_minutes)}
              </span>
            )}

            {step.image_url && (
              <img
                src={step.image_url}
                alt=""
                loading="lazy"
                className="mt-1 w-full max-w-md border border-ceniza/20 object-cover"
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
