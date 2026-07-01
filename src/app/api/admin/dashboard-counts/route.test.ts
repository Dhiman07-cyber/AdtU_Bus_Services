import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the security wrapper to run the handler directly
vi.mock('@/lib/security/api-security', () => ({
  withSecurity: (handler: any) => {
    return async (req: any) => {
      return handler(req, {
        auth: { uid: 'test-admin', email: 'admin@test.com', role: 'admin', name: 'Test Admin' },
        body: null,
        requestId: 'test-request-id',
        headers: new Headers(),
        ip: '127.0.0.1',
      });
    };
  },
}));

// Now import GET after the mock is registered
import { GET } from './route';

describe('GET /api/admin/dashboard-counts', () => {
  it('should execute the API route handler successfully', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/dashboard-counts');
    const res = await GET(req);
    
    console.log('Response Status:', res.status);
    const body = await res.json();
    console.log('Response Body:', JSON.stringify(body, null, 2));

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
