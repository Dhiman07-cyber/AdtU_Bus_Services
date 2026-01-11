import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Get the path to the firestore.rules file
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    
    // Read the file content
    const rulesContent = await fs.readFile(rulesPath, 'utf8');
    
    return new Response(JSON.stringify({ 
      success: true, 
      content: rulesContent 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error reading firestore.rules:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to read firestore.rules file' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}