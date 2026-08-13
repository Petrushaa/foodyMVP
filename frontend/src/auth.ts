import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

async function refreshAccessToken(token: any) {
    try {
        const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const response = await fetch(`${API_URL}/auth/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: token.refreshToken }),
        });

        if (!response.ok) {
            throw new Error("RefreshAccessTokenError");
        }

        const refreshed = await response.json();
        return {
            ...token,
            accessToken: refreshed.access,
            // If backend also rotates refresh token, use the new one
            refreshToken: refreshed.refresh ?? token.refreshToken,
            accessTokenExpires: Date.now() + 55 * 60 * 1000, // 55 min
            error: undefined,
        };
    } catch {
        return { ...token, error: "RefreshAccessTokenError" };
    }
}

/** Как часто перечитываем профиль в токен. */
const PROFILE_TTL = 5 * 60 * 1000;

/**
 * Подтягивает имя и аватар из профиля в токен.
 *
 * Нужно потому, что имя снимается один раз при входе и дальше в куке
 * не меняется: поменял имя в настройках — интерфейс до перезахода рисует
 * старое, а если имени на момент входа не было, заглушка берёт букву из
 * логина («L» от «logacevz» вместо «К» от «Кирыч»).
 *
 * Ошибку глотаем: профиль — не то, ради чего стоит рвать сессию.
 */
async function withFreshProfile(token: any) {
    // Обновление токена уже провалилось — ходить с мёртвым токеном незачем.
    if (token.error) return token;

    const fetchedAt = token.profileFetchedAt as number | undefined;
    const isFresh = fetchedAt && Date.now() - fetchedAt < PROFILE_TTL;
    // Имя, равное логину, — это не имя, а заглушка на случай пустого профиля.
    // Ждать с ней пять минут незачем: человек мог заполнить имя только что.
    const hasRealName = token.name && token.name !== token.username;
    if (isFresh && hasRealName) return token;

    try {
        const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const response = await fetch(`${API_URL}/users/me/`, {
            headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        if (!response.ok) return token;

        const me = await response.json();
        return {
            ...token,
            name: me.full_name || me.username || token.name,
            picture: me.avatar ?? null,
            username: me.username ?? token.username,
            profileFetchedAt: Date.now(),
        };
    } catch {
        return token;
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                const email = credentials.email as string
                const password = credentials.password as string

                if (!email || !password) return null

                try {
                    const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

                    const response = await fetch(`${API_URL}/auth/token/`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password }),
                    });

                    if (!response.ok) return null;

                    const tokens = await response.json();

                    // Fetch real user data to get Django user ID
                    let userId: number | null = null;
                    let username: string | null = null;
                    let displayName: string | null = null;
                    let avatar: string | null = null;
                    try {
                        const meResponse = await fetch(`${API_URL}/users/me/`, {
                            headers: { Authorization: `Bearer ${tokens.access}` },
                        });
                        if (meResponse.ok) {
                            const me = await meResponse.json();
                            userId = me.id ?? null;
                            username = me.username ?? null;
                            // Показываем человеку его имя, а не логин: иначе заглушка
                            // аватара берёт букву из «mr.dragon.100», а не из «Женя».
                            displayName = me.full_name || me.username || null;
                            avatar = me.avatar || null;
                        }
                    } catch {
                        // Non-fatal — id will fall back to email
                    }

                    return {
                        id: userId ? String(userId) : email,
                        email: email,
                        name: displayName,
                        image: avatar,
                        username,
                        accessToken: tokens.access,
                        refreshToken: tokens.refresh,
                        // Assume 60 min lifetime, refresh 5 min early
                        accessTokenExpires: Date.now() + 55 * 60 * 1000,
                    } as any;
                } catch (error) {
                    console.error("Auth error:", error);
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            // Initial sign in — copy from user object
            if (user) {
                token.accessToken = (user as any).accessToken
                token.refreshToken = (user as any).refreshToken
                token.accessTokenExpires = (user as any).accessTokenExpires
                token.name = user.name ?? token.name
                token.picture = (user as any).image ?? token.picture
                token.username = (user as any).username ?? token.username
                token.profileFetchedAt = Date.now()
                return token
            }

            // Return previous token if it hasn't expired yet (with 60s buffer)
            const expiresAt = token.accessTokenExpires as number | undefined;
            if (expiresAt && Date.now() < expiresAt - 60 * 1000) {
                // Токен ещё живой, но профиль в нём мог устареть.
                return withFreshProfile(token)
            }

            // Access token has expired — try to refresh
            return withFreshProfile(await refreshAccessToken(token))
        },
        async session({ session, token }) {
            // If the refresh failed, drop session so middleware/pages
            // consistently redirect to /login instead of silently using
            // a stale (now-401) accessToken in API calls.
            if (token.error) {
                return null as any;
            }
            if (session.user) {
                (session.user as any).accessToken = token.accessToken;
                // Имя и аватар нужны интерфейсу: по ним рисуется заглушка
                // и подпись в поле ввода комментария.
                session.user.name = (token.name as string) ?? session.user.name;
                session.user.image = (token.picture as string) ?? session.user.image;
                (session.user as any).username = (token as any).username;
                // Pass through the real Django user ID stored at login
                if (token.sub) {
                    session.user.id = token.sub;
                }
            }
            return session
        },
    },
    pages: {
        signIn: "/login",
    },
})
