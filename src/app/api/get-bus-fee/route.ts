import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBusFee } from '@/lib/bus-fee-service';

/**
 * GET /api/get-bus-fee
 * Fetches current bus fee from settings collection
 * Public endpoint (no auth required for reading fee)
 */
export async function GET(request: NextRequest) {
  try {
    const feeData = await getCurrentBusFee();
    
    console.log('🔍 Bus fee service returned:', feeData);
    
    return NextResponse.json({
      success: true,
      data: {
        amount: feeData.amount,
        updatedAt: feeData.updatedAt,
        updatedBy: feeData.updatedBy
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching bus fee:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch bus fee' },
      { status: 500 }
    );
  }
}
