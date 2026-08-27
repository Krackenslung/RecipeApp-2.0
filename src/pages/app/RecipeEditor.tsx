import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useDeleteRecipe, useRecipe, usePublishRecipe, useUpdateRecipe } from '@/queries/useRecipe';
import { useUploadRecipeImage, UploadError } from '@/queries/useUpload';
import { useAuth } from '@/context/AuthProvider';
import { useDialog } from '@/hooks/useDialog';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextArea, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';

/**
 * Edit what a human can reasonably fix on a generated recipe: the framing, the
 * numbers and the photo. Ingredients and steps stay as the model wrote them —
 * editing those is a bigger screen than this one.
 */
export default function RecipeEditor() {
  const { slug } = useParams<{ slug: string }>();
  const { data: recipe, isLoading, isError, refetch } = useRecipe(slug);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const update = useUpdateRecipe();
  const publish = usePublishRecipe();
  const remove = useDeleteRecipe();
  const upload = useUploadRecipeImage();
  const deleteDialog = useDialog();
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '',
    summary: '',
    servings: 4,
    prepMinutes: '' as number | '',
    cookMinutes: '' as number | '',
    difficulty: '' as number | '',
    estCost: '' as number | '',
    coverImageUrl: '',
  });

  useEffect(() => {
    if (!recipe) return;
    setForm({
      title: recipe.title,
      summary: recipe.summary ?? '',
      servings: recipe.servings,
      prepMinutes: recipe.prep_minutes ?? '',
      cookMinutes: recipe.cook_minutes ?? '',
      difficulty: recipe.difficulty ?? '',
      estCost: recipe.est_cost ?? '',
      coverImageUrl: recipe.cover_image_url ?? '',
    });
  }, [recipe]);

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (!recipe) return null;

  // RLS would reject the write anyway; this is so the screen says why.
  if (user?.id !== recipe.author_id) {
    return (
      <EmptyState
        title="Esta receta no es tuya"
        message="Solo quien la creó puede editarla."
        action={
          <Link to={`/r/${recipe.slug}`} className="text-sm text-brand underline">
            Ver la receta
          </Link>
        }
      />
    );
  }

  const isDraft = recipe.status !== 'published' || recipe.visibility !== 'public';

  function save() {
    update.mutate(
      {
        recipeId: recipe!.recipe_id,
        patch: {
          title: form.title.trim(),
          summary: form.summary.trim() || null,
          servings: form.servings,
          prep_minutes: form.prepMinutes === '' ? null : form.prepMinutes,
          cook_minutes: form.cookMinutes === '' ? null : form.cookMinutes,
          difficulty: form.difficulty === '' ? null : form.difficulty,
          est_cost: form.estCost === '' ? null : form.estCost,
          cover_image_url: form.coverImageUrl.trim() || null,
        },
      },
      {
        onSuccess: () => toast('Guardada', 'success'),
        onError: () => toast('No pudimos guardar los cambios.', 'error'),
      },
    );
  }

  function onPickFile(file: File) {
    upload.mutate(
      { recipeId: recipe!.recipe_id, file },
      {
        onSuccess: ({ publicUrl }) => {
          setForm((f) => ({ ...f, coverImageUrl: publicUrl }));
          toast('Foto subida. Guarda para aplicarla.', 'success');
        },
        onError: (e) =>
          toast(e instanceof UploadError ? e.message : 'No pudimos subir la foto.', 'error'),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            Editar receta
          </h1>
          <p className="mt-1 text-sm text-body">
            {isDraft ? 'Borrador privado' : 'Publicada'} ·{' '}
            <Link to={`/r/${recipe.slug}`} className="text-brand underline">
              Ver
            </Link>
          </p>
        </div>
        {isDraft && (
          <Button
            variant="primary"
            size="sm"
            loading={publish.isPending}
            onClick={() =>
              publish.mutate(recipe.recipe_id, {
                onSuccess: () => toast('Publicada', 'success'),
                onError: () => toast('No pudimos publicarla.', 'error'),
              })
            }
          >
            Publicar
          </Button>
        )}
      </header>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField
          label="Título"
          required
          maxLength={120}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <TextArea
          label="Resumen"
          hint="Es lo que se lee en la tarjeta."
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextField
            label="Porciones"
            type="number"
            min={1}
            max={100}
            mono
            required
            value={form.servings}
            onChange={(e) => setForm({ ...form, servings: Number(e.target.value) })}
          />
          <TextField
            label="Prep (min)"
            type="number"
            min={0}
            mono
            value={form.prepMinutes}
            onChange={(e) =>
              setForm({ ...form, prepMinutes: e.target.value === '' ? '' : Number(e.target.value) })
            }
          />
          <TextField
            label="Cocción (min)"
            type="number"
            min={0}
            mono
            value={form.cookMinutes}
            onChange={(e) =>
              setForm({ ...form, cookMinutes: e.target.value === '' ? '' : Number(e.target.value) })
            }
          />
          <TextField
            label={`Costo (${recipe.currency})`}
            type="number"
            min={0}
            step={1}
            mono
            value={form.estCost}
            onChange={(e) =>
              setForm({ ...form, estCost: e.target.value === '' ? '' : Number(e.target.value) })
            }
          />
        </div>

        <SelectField
          label="Dificultad"
          value={form.difficulty}
          onChange={(e) =>
            setForm({ ...form, difficulty: e.target.value === '' ? '' : Number(e.target.value) })
          }
        >
          <option value="">Sin especificar</option>
          <option value={1}>Fácil</option>
          <option value={2}>Media</option>
          <option value={3}>Difícil</option>
        </SelectField>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-body">Foto</span>

          {form.coverImageUrl && (
            <img
              src={form.coverImageUrl}
              alt=""
              className="h-[180px] w-full max-w-xs rounded-card border border-line-strong object-cover"
            />
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = '';
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} aria-hidden />
              Subir una foto
            </Button>
            {form.coverImageUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setForm({ ...form, coverImageUrl: '' })}
              >
                Quitar
              </Button>
            )}
            <span className="text-xs text-body">JPG, PNG, WebP o AVIF. Hasta 5 MB.</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-strong pt-5">
          <Button type="button" variant="danger" size="sm" onClick={deleteDialog.show}>
            Eliminar receta
          </Button>

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(`/r/${recipe.slug}`)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Guardar
            </Button>
          </div>
        </div>
      </form>

      <Dialog
        dialogRef={deleteDialog.ref}
        title="¿Eliminar esta receta?"
        onClose={deleteDialog.close}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={deleteDialog.close}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(recipe.recipe_id, {
                  onSuccess: () => {
                    toast('Eliminada', 'success');
                    navigate('/me');
                  },
                  onError: () => toast('No pudimos eliminarla.', 'error'),
                })
              }
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          Deja de aparecer en el feed y en las colecciones. Los comentarios y las calificaciones se
          conservan.
        </p>
      </Dialog>
    </div>
  );
}
