import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Drop the cached public masjid pages so dashboard edits (publishing an event,
 * generating prayer times, …) show up on the very next visit instead of after
 * the ISR window. Revalidating is harmless, so no auth is required.
 */
export async function POST(): Promise<NextResponse> {
  revalidatePath('/m/[slug]', 'page');
  return NextResponse.json({ revalidated: true });
}
