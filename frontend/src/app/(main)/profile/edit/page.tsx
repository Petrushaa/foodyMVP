/**
 * /profile/edit → /me/edit redirect (backward-compat alias).
 */
import { redirect } from "next/navigation";

export default async function EditProfilePage() {
  redirect("/me/edit");
}
