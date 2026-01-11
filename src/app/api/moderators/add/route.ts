import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define types for our data
interface Moderator {
  id: string;
  name: string;
  email: string;
  faculty: string;
  joinDate: string;
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
    const newModeratorData = await request.json();
    
    const moderators: Moderator[] = readJsonFile('Moderators.json');
    const newModerator = {
      ...newModeratorData,
      id: Date.now().toString()
    };
    moderators.push(newModerator);
    writeJsonFile('Moderators.json', moderators);
    
    return NextResponse.json(newModerator, { status: 201 });
  } catch (error) {
    console.error('Error adding moderator:', error);
    return NextResponse.json({ error: 'Failed to add moderator' }, { status: 500 });
  }
}