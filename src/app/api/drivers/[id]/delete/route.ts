import { NextResponse } from 'next/server';
import { deleteUserAndData } from '@/lib/cleanup-helpers';
import fs from 'fs';
import path from 'path';

// Get the data directory path
const dataDirectory = path.join(process.cwd(), 'src', 'data');

// Helper function to read JSON files
const readJsonFile = (filename: string) => {
  const filePath = path.join(dataDirectory, filename);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContents);
};

// Helper function to write JSON files
const writeJsonFile = (filename: string, data: any) => {
  const filePath = path.join(dataDirectory, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    console.log(`Deleting driver with ID: ${id}`);
    
    // Use centralized cleanup helper to delete from Firestore, Firebase Auth, and Cloudinary
    const result = await deleteUserAndData(id, 'driver');
    
    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to delete driver' 
      }, { status: 500 });
    }
    
    // Also delete from JSON file (legacy support)
    try {
      const drivers = readJsonFile('Drivers.json');
      const updatedDrivers = drivers.filter((driver: any) => driver.id !== id);
      
      if (drivers.length !== updatedDrivers.length) {
        writeJsonFile('Drivers.json', updatedDrivers);
        console.log(`Driver with ID ${id} deleted from JSON file`);
      }
    } catch (jsonError) {
      console.warn('Could not update JSON file:', jsonError);
      // Don't fail the operation if JSON file update fails
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Driver deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting driver:', error);
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 });
  }
}