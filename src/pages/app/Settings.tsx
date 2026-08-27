import { useEffect, useState } from 'react';
import { useAllergens, useDiets } from '@/queries/useCatalog';
import {
  useAllergenPreferences,
  useDietPreferences,
  useMyProfile,
  useSaveAllergenPreferences,
  useSaveDietPreferences,
  useUpdateProfile,
} from '@/queries/useProfile';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { TagGroup } from '@/components/filters/TagGroup';

export default function Settings() {
  const { data: profile, isLoading } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setBio(profile.bio ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
  }, [profile]);

  const { data: diets = [] } = useDiets();
  const { data: allergens = [] } = useAllergens();
  const { data: dietPrefs } = useDietPreferences();
  const { data: allergenPrefs } = useAllergenPreferences();
  const saveDiets = useSaveDietPreferences();
  const saveAllergens = useSaveAllergenPreferences();

  const [selectedDiets, setSelectedDiets] = useState<number[]>([]);
  const [selectedAllergens, setSelectedAllergens] = useState<number[]>([]);

  useEffect(() => {
    if (dietPrefs) setSelectedDiets(dietPrefs);
  }, [dietPrefs]);
  useEffect(() => {
    if (allergenPrefs) setSelectedAllergens(allergenPrefs);
  }, [allergenPrefs]);

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <h1 className="text-3xl font-semibold text-ink">Ajustes</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-ink">Perfil</h2>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateProfile.mutate(
              {
                display_name: displayName.trim() || null,
                bio: bio.trim() || null,
                avatar_url: avatarUrl.trim() || null,
              },
              {
                onSuccess: () => toast('Perfil guardado', 'success'),
                onError: () => toast('No pudimos guardar tu perfil.', 'error'),
              },
            );
          }}
        >
          <TextField
            label="Usuario"
            value={profile?.username ?? ''}
            readOnly
            disabled
            hint="El usuario no se cambia desde aquí."
          />
          <TextField
            label="Nombre visible"
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <TextArea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
          <TextField
            label="Foto (URL)"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={updateProfile.isPending}>
              Guardar perfil
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-4 border-t border-line-strong pt-8">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Dietas y alérgenos
          </h2>
          <p className="mt-1 text-sm text-body">
            Esto pre-llena los filtros cuando entras. Siempre puedes quitarlos en la búsqueda.
          </p>
        </div>

        <TagGroup
          label="Mis dietas"
          tone="diet"
          combinator="ALL"
          items={diets.map((d) => ({ id: d.diet_id, name: d.name }))}
          value={selectedDiets}
          onChange={setSelectedDiets}
        />

        <TagGroup
          label="Alérgenos a evitar"
          tone="accent"
          combinator="NONE"
          items={allergens.map((a) => ({ id: a.allergen_id, name: a.name }))}
          value={selectedAllergens}
          onChange={setSelectedAllergens}
          note="Los alérgenos se calculan desde los ingredientes, incluso los opcionales."
        />

        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={saveDiets.isPending || saveAllergens.isPending}
            onClick={() => {
              saveDiets.mutate(selectedDiets, {
                onSuccess: () =>
                  saveAllergens.mutate(selectedAllergens, {
                    onSuccess: () => toast('Preferencias guardadas', 'success'),
                    onError: () => toast('No pudimos guardar tus preferencias.', 'error'),
                  }),
                onError: () => toast('No pudimos guardar tus preferencias.', 'error'),
              });
            }}
          >
            Guardar preferencias
          </Button>
        </div>
      </section>
    </div>
  );
}
