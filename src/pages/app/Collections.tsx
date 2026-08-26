import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Plus } from 'lucide-react';
import { useCreateCollection, useMyCollections } from '@/queries/useCollections';
import { useDialog } from '@/hooks/useDialog';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, TextArea, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/utils/format';

export default function Collections() {
  const { data: collections, isLoading, isError, refetch } = useMyCollections();
  const create = useCreateCollection();
  const dialog = useDialog();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  function submit() {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, is_public: isPublic },
      {
        onSuccess: () => {
          toast('Colección creada', 'success');
          setName('');
          setDescription('');
          setIsPublic(false);
          dialog.close();
        },
        onError: () => toast('Ya tienes una colección con ese nombre.', 'error'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight text-comal">
            Colecciones
          </h1>
          <p className="mt-1 text-sm text-ceniza">
            {collections ? `${collections.length}` : '…'} en total
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={dialog.show}>
          <Plus size={14} aria-hidden />
          Nueva colección
        </Button>
      </header>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !collections?.length ? (
        <EmptyState
          title="Sin colecciones"
          message="Agrupa recetas por lo que quieras: la semana, los tacos, lo que le gusta a tu mamá."
          action={
            <Button variant="primary" onClick={dialog.show}>
              Crear la primera
            </Button>
          }
        />
      ) : (
        <ul className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {collections.map((c) => (
            <li key={c.collection_id}>
              <Link
                to={`/c/${c.collection_id}`}
                className="flex h-full flex-col gap-2 border border-ceniza/20 bg-cal p-4 transition-colors hover:border-comal"
              >
                <div className="flex items-start gap-2">
                  <h2 className="flex-1 font-display text-lg font-black tracking-tight text-comal">
                    {c.name}
                  </h2>
                  {!c.is_public && <Lock size={13} className="mt-1 text-ceniza" aria-label="Privada" />}
                </div>
                {c.description && <p className="line-clamp-2 text-sm text-ceniza">{c.description}</p>}
                <span className="mt-auto font-mono text-xs text-ceniza">
                  {formatDate(c.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        dialogRef={dialog.ref}
        title="Nueva colección"
        onClose={dialog.close}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={dialog.close}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim()}
              onClick={submit}
            >
              Crear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nombre"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <TextArea
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Checkbox
            label="Pública — cualquiera con la liga puede verla"
            checked={isPublic}
            onChange={setIsPublic}
          />
        </div>
      </Dialog>
    </div>
  );
}
