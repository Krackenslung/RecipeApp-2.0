import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useComments, useDeleteComment, usePostComment, type CommentNode } from '@/queries/useComments';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/utils/format';

export function CommentThread({ recipeId }: { recipeId: string }) {
  const { data: comments, isLoading, isError } = useComments(recipeId);
  const { user } = useAuth();
  const post = usePostComment(recipeId);
  const { toast } = useToast();
  const [body, setBody] = useState('');

  return (
    <section className="flex flex-col gap-4 border-t border-ceniza/20 pt-8">
      <h2 className="font-display text-xl font-black tracking-tight text-comal">Comentarios</h2>

      {user ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            post.mutate(
              { body: body.trim() },
              {
                onSuccess: () => {
                  setBody('');
                  toast('Comentario publicado', 'success');
                },
                onError: () => toast('No pudimos publicar tu comentario.', 'error'),
              },
            );
          }}
        >
          <label htmlFor="comment-body" className="sr-only">
            Tu comentario
          </label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="¿Cómo te quedó? ¿Cambiaste algo?"
            className="min-h-20 w-full resize-y border border-ceniza/35 bg-cal px-3 py-2 text-sm text-comal placeholder:text-ceniza/70 focus:border-comal focus:outline-none"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={post.isPending} disabled={!body.trim()}>
              Comentar
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-ceniza">
          <Link to="/login" className="text-guajillo underline">
            Entra
          </Link>{' '}
          para comentar.
        </p>
      )}

      {isLoading && <Spinner />}
      {isError && <p className="text-sm text-ceniza">No pudimos cargar los comentarios.</p>}

      {comments && comments.length === 0 && (
        <p className="text-sm text-ceniza">Nadie ha comentado todavía.</p>
      )}

      <ul className="flex flex-col gap-5">
        {comments?.map((c) => (
          <Comment key={c.comment_id} node={c} recipeId={recipeId} depth={0} />
        ))}
      </ul>
    </section>
  );
}

function Comment({
  node,
  recipeId,
  depth,
}: {
  node: CommentNode;
  recipeId: string;
  depth: number;
}) {
  const { user } = useAuth();
  const post = usePostComment(recipeId);
  const remove = useDeleteComment(recipeId);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');

  // Soft delete preserves the thread, so the row is still here — render it as
  // a tombstone rather than dropping its replies on the floor.
  const deleted = node.deleted_at != null;

  return (
    <li className={depth > 0 ? 'ml-6 border-l border-ceniza/20 pl-4' : ''}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          {node.author ? (
            <Link
              to={`/u/${node.author.username}`}
              className="text-sm font-medium text-comal transition-colors hover:text-guajillo"
            >
              {node.author.display_name ?? node.author.username}
            </Link>
          ) : (
            <span className="text-sm text-ceniza">Alguien</span>
          )}
          <span className="font-mono text-xs text-ceniza">{formatDate(node.created_at)}</span>
        </div>

        {deleted ? (
          <p className="text-sm italic text-ceniza">Comentario eliminado.</p>
        ) : (
          <p className="text-sm leading-relaxed text-comal">{node.body}</p>
        )}

        {!deleted && (
          <div className="flex items-center gap-3 text-xs text-ceniza">
            {user && depth === 0 && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="transition-colors hover:text-comal"
              >
                Responder
              </button>
            )}
            {user?.id === node.user_id && (
              <button
                type="button"
                onClick={() => remove.mutate(node.comment_id)}
                className="transition-colors hover:text-guajillo"
              >
                Eliminar
              </button>
            )}
          </div>
        )}

        {replying && (
          <form
            className="mt-1 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              post.mutate(
                { body: reply.trim(), parentId: node.comment_id },
                {
                  onSuccess: () => {
                    setReply('');
                    setReplying(false);
                  },
                },
              );
            }}
          >
            <label htmlFor={`reply-${node.comment_id}`} className="sr-only">
              Tu respuesta
            </label>
            <textarea
              id={`reply-${node.comment_id}`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="min-h-16 w-full resize-y border border-ceniza/35 bg-cal px-3 py-2 text-sm text-comal focus:border-comal focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setReplying(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" loading={post.isPending} disabled={!reply.trim()}>
                Responder
              </Button>
            </div>
          </form>
        )}
      </div>

      {node.replies.length > 0 && (
        <ul className="mt-4 flex flex-col gap-4">
          {node.replies.map((child) => (
            <Comment key={child.comment_id} node={child} recipeId={recipeId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
