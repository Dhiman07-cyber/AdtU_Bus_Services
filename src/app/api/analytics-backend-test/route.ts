import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const formatPrivateKey = (key?: string) => {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n').replace(/"/g, '');
};

const _get = async () => {
  try {
    const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '507313354';
    const clientEmail = process.env.GA_CLIENT_EMAIL;
    const privateKey = formatPrivateKey(process.env.GA_PRIVATE_KEY);
    const projectId = process.env.GA_PROJECT_ID;

    if (!clientEmail || !privateKey || !projectId) {
      return NextResponse.json({ error: 'GA credentials missing' }, { status: 500 });
    }

    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: { client_email: clientEmail, private_key: privateKey },
      projectId,
    });

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }]
    });

    if (!response.rows || response.rows.length === 0) {
      return NextResponse.json({ status: 'no_data', propertyId: PROPERTY_ID });
    }

    return NextResponse.json({
      status: 'success',
      rowCount: response.rows.length,
      totals: {
        users: response.rows.reduce((a: number, b: any) => a + parseInt(b.metricValues[0].value, 10), 0),
        sessions: response.rows.reduce((a: number, b: any) => a + parseInt(b.metricValues[1].value, 10), 0)
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

export const GET = withSecurity(_get, {
  requiredRoles: ['admin', 'moderator'],
  rateLimit: RateLimits.ADMIN,
});
