import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';

export interface SessionUser {
  id: string;
  role?: string;
  name?: string;
  username?: string;
}

/** Returns the authenticated user, or null if not logged in. */
export async function getAuthUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as Record<string, unknown> | undefined;
  if (!user?.id) return null;
  return {
    id: String(user.id),
    role: typeof user.role === 'string' ? user.role : undefined,
    name: typeof user.name === 'string' ? user.name : undefined,
    username: typeof user.username === 'string' ? user.username : undefined,
  };
}

/** Returns an unauthorized/forbidden response if the user is not an admin. */
export async function requireAdmin(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (user.role !== 'ADMIN') {
    return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { user, error: null };
}
