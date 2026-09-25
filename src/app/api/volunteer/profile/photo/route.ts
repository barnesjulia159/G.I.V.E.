import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const BUCKET = "profile-photos";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function isSupportedImage(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function getUserAndClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function POST(request: Request) {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let file: unknown;
  try {
    const formData = (await request.formData()) as unknown as {
      get(name: string): unknown;
    };
    file = formData.get("photo");
  } catch {
    return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { message: "Choose a JPEG, PNG, or WebP image." },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { message: "Profile photos must be 5 MB (5,120 KB) or smaller." },
      { status: 413 }
    );
  }
  if (!(await isSupportedImage(file))) {
    return NextResponse.json(
      { message: "The selected file is not a valid image." },
      { status: 415 }
    );
  }

  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "0",
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { message: "The profile photo could not be uploaded. Please try again." },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  try {
    await prisma.profile.update({
      where: { id: user.id },
      data: { avatarUrl: data.publicUrl },
    });
  } catch {
    return NextResponse.json(
      { message: "The image uploaded, but your profile could not be updated." },
      { status: 500 }
    );
  }

  return NextResponse.json({ avatarUrl: data.publicUrl });
}

export async function DELETE() {
  const { supabase, user } = await getUserAndClient();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([`${user.id}/avatar`]);

  if (storageError) {
    return NextResponse.json(
      { message: "The profile photo could not be removed. Please try again." },
      { status: 500 }
    );
  }

  try {
    await prisma.profile.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });
  } catch {
    return NextResponse.json(
      { message: "The photo was removed, but your profile could not be updated." },
      { status: 500 }
    );
  }

  return NextResponse.json({ avatarUrl: null });
}