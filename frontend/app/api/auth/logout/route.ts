import { NextResponse } from "next/server";
import { revalidatePath } from 'next/cache'; 
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
  await clearAuthCookie();
  revalidatePath('/[locale]', 'layout');
  return NextResponse.json({ success: true });
}