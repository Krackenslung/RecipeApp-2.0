import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <EmptyState
      title="Aquí no hay nada"
      message="La liga no lleva a ninguna receta."
      action={<ButtonLink to="/">Volver a explorar</ButtonLink>}
    />
  );
}
