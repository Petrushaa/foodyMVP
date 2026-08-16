"use client";

import { useCallback, useEffect, useState } from "react";

import { toggleFollow } from "@/lib/feed-client";

type Options = {
  /** Подписки, как их видит сервер: handles вида "@username". */
  initialFollowingUsers: string[];
  /** Можно ли действовать: гостю кнопка ведёт на вход, а не на запрос. */
  canAct: boolean;
  /** Кому подписываемся: по handle находим id автора среди известных постов. */
  resolveUserId: (author: string) => number | undefined;
  onDenied: () => void;
  onError: (message: string) => void;
};

/**
 * Состояние подписок для ленты.
 *
 * Живёт одним куском, потому что раньше эта логика была скопирована в каждую
 * ленту, и любую правку приходилось делать дважды — сверку с сервером,
 * например, я чинил ровно так. Один экземпляр означает, что и починка одна.
 */
export function useFollowState({
  initialFollowingUsers,
  canAct,
  resolveUserId,
  onDenied,
  onError,
}: Options) {
  const [following, setFollowing] = useState<Set<string>>(
    () => new Set(initialFollowingUsers),
  );
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  // Сервер — источник правды: после перерисовки страницы приходит свежий
  // список. Без сверки набор оставался бы таким, каким был при первом рендере,
  // и подписка, сделанная на другом экране, сюда бы не доехала.
  //
  // Пока запрос в полёте, сверку пропускаем: перерисовка могла быть посчитана
  // до него, и свежее нажатие откатилось бы обратно.
  const followingKey = initialFollowingUsers.join(",");
  useEffect(() => {
    if (pending.size > 0) return;
    setFollowing(new Set(initialFollowingUsers));
    // Зависимость — followingKey, а не сам массив: он каждый рендер новый.
  }, [followingKey]);

  const toggle = useCallback(
    async (author: string, nextFollowing: boolean) => {
      if (!canAct) {
        onDenied();
        return;
      }
      if (pending.has(author)) return;

      const targetUserId = resolveUserId(author);
      if (!targetUserId) {
        onError("Не удалось определить пользователя для подписки.");
        return;
      }

      setPending((current) => new Set(current).add(author));
      try {
        await toggleFollow(author, targetUserId, undefined, nextFollowing);
        setFollowing((current) => {
          const next = new Set(current);
          if (nextFollowing) next.add(author);
          else next.delete(author);
          return next;
        });
      } catch {
        onError("Не удалось обновить подписку.");
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(author);
          return next;
        });
      }
    },
    [canAct, onDenied, onError, pending, resolveUserId],
  );

  return {
    isFollowing: (author: string) => following.has(author),
    isPending: (author: string) => pending.has(author),
    toggle,
  };
}
