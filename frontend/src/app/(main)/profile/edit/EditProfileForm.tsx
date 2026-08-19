"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, ArrowLeft } from "lucide-react";
import { updateProfile } from "@/app/actions/profile";
import { GlassSurface } from "@/components/feed/glass-surface";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CitySelect } from "@/components/ui/city-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FIELD_SURFACE_AUTO as FIELD_SURFACE,
  FIELD_INPUT_PLAIN as FIELD_INPUT,
} from "@/components/ui/field-styles";


interface UserData {
  name: string;
  username: string;
  avatar: string;
  bio: string;
  city: string;
}

export default function EditProfileForm({
  initialData,
  accessToken,
}: {
  initialData: UserData;
  accessToken: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialData.name);
  const [username, setUsername] = useState(initialData.username);
  const [bio, setBio] = useState(initialData.bio);
  const [city, setCity] = useState(initialData.city);
  const [previewUrl, setPreviewUrl] = useState<string>(initialData.avatar);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith("image/")) {
        setError("Пожалуйста, загрузите изображение (JPG, PNG)");
        return;
      }
      setError(null);
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  }

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("full_name", name);
      fd.append("username", username);
      fd.append("bio_text", bio);
      fd.append("city", city);
      if (file) fd.append("avatar", file);

      const res = await updateProfile(fd, accessToken);
      if (res?.error) {
        setError(res.error);
      } else {
        router.replace("/me?profileSaved=1");
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка при сохранении");
    } finally {
      setIsLoading(false);
    }
  }

  const isChanged =
    name !== initialData.name ||
    username !== initialData.username ||
    bio !== initialData.bio ||
    city !== initialData.city ||
    file !== null;

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="mb-2 flex items-center justify-between px-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="grid size-9 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[18px]"
            aria-label="Назад"
          >
            <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
          </button>
          <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            Редактировать
          </h1>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isChanged || isLoading}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-bold text-white shadow-[0_6px_18px_rgba(46,204,113,0.35)]",
              isChanged ? "bg-[#2ECC71]" : "bg-[#9AD9B0]",
              isLoading && "opacity-60",
            )}
          >
            {isLoading ? "..." : "Сохранить"}
          </button>
        </header>

        <div className="hide-scroll flex-1 overflow-y-auto px-4 pb-25 pt-3">
          <div className="space-y-5">
            <section className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar className="size-28 border-2 border-[#2ECC71] shadow-[0_12px_30px_rgba(20,40,28,0.2)] after:hidden">
                  {previewUrl ? (
                    <AvatarImage src={previewUrl} alt={name || "Профиль"} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-white text-[28px] font-extrabold text-[#15291C]">
                    {(name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full border border-white bg-[#2ECC71] text-white shadow-[0_6px_18px_rgba(46,204,113,0.5)]"
                  aria-label="Изменить фото"
                >
                  <Camera className="size-4" strokeWidth={2.2} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-[13px] font-bold text-[#1B7F45]"
              >
                Изменить фото
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </section>

            {error && (
              <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                {error}
              </div>
            )}

            <GlassSurface className="rounded-[22px] border border-white/65 bg-white/45 px-5 py-5 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
              <div className="space-y-4">
                {/* B2 (a11y): у каждого input/textarea есть name + id, label.htmlFor
                    указывает на них — autofill / screen readers / тесты работают. */}
                <div>
                  <label
                    htmlFor="full_name"
                    className="mb-2 block text-[13px] font-bold tracking-[0.1em] text-[#5C6B62] uppercase"
                  >
                    Имя
                  </label>
                  <GlassSurface className={FIELD_SURFACE}>
                    <Input
                      id="full_name"
                      name="full_name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ваше имя"
                      className={FIELD_INPUT}
                    />
                  </GlassSurface>
                </div>

                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-[13px] font-bold tracking-[0.1em] text-[#5C6B62] uppercase"
                  >
                    Никнейм
                  </label>
                  <GlassSurface className={FIELD_SURFACE}>
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className={FIELD_INPUT}
                    />
                  </GlassSurface>
                </div>

                <div>
                  <label
                    htmlFor="city"
                    className="mb-2 block text-[13px] font-bold tracking-[0.1em] text-[#5C6B62] uppercase"
                  >
                    Город
                  </label>
                  <CitySelect
                    id="city"
                    name="city"
                    value={city}
                    onChange={setCity}
                    autoComplete="address-level2"
                    surfaceClassName={FIELD_SURFACE}
                    inputClassName={FIELD_INPUT}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-end justify-between">
                    <label
                      htmlFor="bio"
                      className="text-[13px] font-bold tracking-[0.1em] text-[#5C6B62] uppercase"
                    >
                      О себе
                    </label>
                    <span className="text-[11px] font-medium text-[#8A958E]">
                      {bio.length} / 250
                    </span>
                  </div>
                  <GlassSurface className={cn(FIELD_SURFACE, "h-auto min-h-[120px]")}>
                    <Textarea
                      id="bio"
                      name="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.substring(0, 250))}
                      placeholder="Расскажите о себе..."
                      className="min-h-[120px] resize-none border-0 bg-transparent px-3.5 py-3 text-[15px] font-medium text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:ring-0"
                    />
                  </GlassSurface>
                </div>
              </div>
            </GlassSurface>
          </div>
        </div>
      </div>
    </main>
  );
}
