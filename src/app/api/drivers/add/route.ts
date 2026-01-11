import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define types for our data
interface Driver {
  id: string;
  name: string;
  email: string;
  licenseNumber: string;
  busAssigned: string;
  [key: string]: any; // Allow additional properties
}

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

export async function POST(request: Request) {
  try {
    const newDriverData = await request.json();
    
    const drivers: Driver[] = readJsonFile('Drivers.json');
    const newDriver = {
      ...newDriverData,
      id: Date.now().toString()
    };
    drivers.push(newDriver);
    writeJsonFile('Drivers.json', drivers);
    
    return NextResponse.json(newDriver, { status: 201 });
  } catch (error) {
    console.error('Error adding driver:', error);
    return NextResponse.json({ error: 'Failed to add driver' }, { status: 500 });
  }
}