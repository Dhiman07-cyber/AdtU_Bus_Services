import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    // Read the JSON file directly from the filesystem
    const filePath = join(process.cwd(), 'src', 'data', 'faculties_departments.json');
    const fileContents = readFileSync(filePath, 'utf8');
    const facultiesData = JSON.parse(fileContents);
    
    return NextResponse.json(facultiesData);
  } catch (error) {
    console.error('Error loading faculties data:', error);
    return NextResponse.json(
      { error: 'Failed to load faculties data' },
      { status: 500 }
    );
  }
}