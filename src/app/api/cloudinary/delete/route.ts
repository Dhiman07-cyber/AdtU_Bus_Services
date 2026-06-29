import { NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/security/api-auth';

export async function DELETE(request: Request) {
  const auth = await verifyApiAuth(request as any);
  if (!auth.authenticated) return auth.response;
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
