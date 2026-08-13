import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { apiRequest, fixMediaUrl } from "@/lib/api";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
    const session = await auth() as any;

    if (!session?.user?.accessToken) {
        redirect("/login");
    }

    let userProfile = null;
    try {
        userProfile = await apiRequest("/users/me/", {
            headers: { "Authorization": `Bearer ${session.user.accessToken}` }
        });
    } catch (e: any) {
        if (e.message === "UNAUTHORIZED") {
            redirect("/login");
        }
    }

    const user = {
        id: session.user.id || session.user.email,
        name: userProfile?.full_name || userProfile?.username || session.user.name || "",
        email: userProfile?.email || session.user.email,
        image: fixMediaUrl(userProfile?.avatar) || session.user.image || "",
        city: userProfile?.city || "",
    };

    return <SettingsForm user={user as any} />;
}
