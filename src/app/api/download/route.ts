
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const fileUrl = searchParams.get('url');
    const filename = searchParams.get('filename') || 'file';

    if (!fileUrl) {
        return NextResponse.json({ error: 'Missing file URL' }, { status: 400 });
    }

    try {
        // Validate URL to prevent arbitrary SSRF if needed, 
        // but for now we assume the frontend sends valid signed/public URLs
        const response = await fetch(fileUrl);

        if (!response.ok) {
            console.error(`Failed to fetch file: ${response.status} ${response.statusText}`);
            return NextResponse.json({ error: 'Failed to fetch file from source' }, { status: 502 });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Create response with proper headers to force download
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': buffer.length.toString(),
            },
        });

    } catch (error) {
        console.error('Download proxy error:', error);
        return NextResponse.json({ error: 'Internal server error during download' }, { status: 500 });
    }
}
