import { redirect } from 'next/navigation';
import { getActor } from '@/server/session';

export const dynamic = 'force-dynamic';

/**
 * The root never renders a marketing page: this is an internal system, so the
 * only honest entry point is the workspace, or the sign-in screen for whoever
 * has no session.
 */
export default async function RootPage() {
  const actor = await getActor();
  redirect(actor ? '/dashboard' : '/login');
}
