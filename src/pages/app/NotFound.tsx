import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <EmptyState
      title="Nothing here"
      message="That link doesn’t lead to a recipe."
      action={<ButtonLink to="/">Back to browsing</ButtonLink>}
    />
  );
}
