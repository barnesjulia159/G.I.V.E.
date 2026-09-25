"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProfilePhotoUploaderProps = {
  initialAvatarUrl: string | null;
};

export function ProfilePhotoUploader({ initialAvatarUrl }: ProfilePhotoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function uploadPhoto() {
    if (!file) {
      setError("Choose a photo from your device first.");
      return;
    }

    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.set("photo", file);
      const response = await fetch("/api/volunteer/profile/photo", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? "The profile photo could not be uploaded.");
      }

      setAvatarUrl(result.avatarUrl);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Profile photo updated.");
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The profile photo could not be uploaded."
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function removePhoto() {
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/volunteer/profile/photo", {
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message ?? "The profile photo could not be removed.");
      }

      setAvatarUrl(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Profile photo removed.");
      router.refresh();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "The profile photo could not be removed."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Current profile photo"
          className="size-24 rounded-full border border-slate-200 bg-slate-100 object-cover"
        />
      )}

      <div className="form-field">
        <label htmlFor="profile-photo" className="form-label">
          Choose a photo from your device
        </label>
        <input
          ref={inputRef}
          id="profile-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="profile-photo-help"
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            setError("");
            setMessage("");
          }}
          className="form-input file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-800"
        />
        <p id="profile-photo-help" className="text-sm text-slate-600">
          JPEG, PNG, or WebP. Maximum file size: 5 MB (5,120 KB).
        </p>
      </div>

      {error && <p role="alert" className="alert-error text-sm">{error}</p>}
      {message && <p role="status" className="alert-info text-sm">{message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={uploadPhoto}
          disabled={!file || isUploading}
          className="min-h-11 rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? "Uploading..." : "Upload photo"}
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={removePhoto}
            disabled={isUploading}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}