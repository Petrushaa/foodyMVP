'use client';

import { useEffect, useState } from 'react';
import styles from './SubscribeButton.module.css';
import { toggleFollow } from '@/app/actions/social';
import { useRouter } from 'next/navigation';

export default function SubscribeButton({ userId, initialIsFollowing, session }: { userId: number | string, initialIsFollowing: boolean, session: any }) {
    const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const router = useRouter();

    // После router.refresh() страница приходит с новыми данными. Без этого
    // кнопка осталась бы на своём прежнем состоянии и разошлась бы с сервером.
    useEffect(() => {
        setIsFollowing(initialIsFollowing);
    }, [initialIsFollowing]);

    useEffect(() => {
        if (notice) {
            const id = setTimeout(() => setNotice(null), 3000);
            return () => clearTimeout(id);
        }
    }, [notice]);

    const handleSubscribe = async () => {
        if (!session) {
            setNotice("Войдите, чтобы подписаться.");
            return;
        }
        if (loading) return;

        const wasFollowing = isFollowing;
        setIsFollowing(!wasFollowing); // Оптимистично, до ответа сервера.
        setLoading(true);

        try {
            const res = await toggleFollow(userId, wasFollowing);

            if (res?.error) {
                setIsFollowing(wasFollowing);
                setNotice(wasFollowing ? "Не удалось отписаться" : "Не удалось подписаться");
                return;
            }

            router.refresh(); // Обновить счётчик подписчиков.
        } catch {
            // Действие упало — возвращаем кнопку в прежнее состояние и говорим
            // об этом. Молча оставлять оптимистичный вид нельзя: человек решит,
            // что подписался.
            setIsFollowing(wasFollowing);
            setNotice("Не удалось изменить подписку");
        } finally {
            // Именно finally: без него любая ошибка оставляла кнопку
            // заблокированной навсегда, и она выглядела зависшей.
            setLoading(false);
        }
    };

    return (
        <>
            <button
                className={styles.subscribeBtn}
                onClick={handleSubscribe}
                disabled={loading}
                style={{
                    background: isFollowing ? 'var(--bg-card, #2A2A2A)' : 'var(--brand-green, #2ecc71)',
                    color: 'white',
                    border: isFollowing ? '1px solid var(--border-color, #333)' : 'none',
                    opacity: loading ? 0.7 : 1
                }}
            >
                {isFollowing ? 'Отписаться' : 'Подписаться'}
            </button>
            {notice && (
                <div className="pointer-events-none fixed right-4 bottom-[6.25rem] left-4 z-30 rounded-[18px] border border-white/70 bg-white/78 px-4 py-3 text-center text-[13px] font-bold text-[#15291C] shadow-[0_12px_24px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[20px]">
                    {notice}
                </div>
            )}
        </>
    );
}
