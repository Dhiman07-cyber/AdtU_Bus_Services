// Define types for faculty and department data
export interface Department {
  Masters?: string[];
  Bachelors?: string[];
}

export interface Faculty {
  id: number;
  faculty: string;
  departments: Department;
}

// Function to load all faculties with their departments
export const getAllFaculties = async (): Promise<Faculty[]> => {
  try {
    const response = await fetch('/api/faculties');
    if (!response.ok) {
      throw new Error(`Failed to fetch faculties: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading faculties data from API:', error);
    return [];
  }
};

// Function to get a faculty by name
export const getFacultyByName = async (name: string): Promise<Faculty | undefined> => {
  const faculties = await getAllFaculties();
  return faculties.find(faculty => faculty.faculty === name);
};

// Function to search faculties by partial name
export const searchFaculties = async (query: string): Promise<Faculty[]> => {
  const faculties = await getAllFaculties();
  if (!query) return faculties;
  
  const lowerQuery = query.toLowerCase();
  return faculties.filter(faculty => 
    faculty.faculty.toLowerCase().includes(lowerQuery)
  );
};

// Function to get all departments within a faculty (no filtering)
export const getFacultyDepartments = async (facultyName: string): Promise<{ category: string; departments: string[] }[]> => {
  const faculty = await getFacultyByName(facultyName);
  if (!faculty) return [];
  
  const departments = faculty.departments;
  const result: { category: string; departments: string[] }[] = [];
  
  // Add Masters departments
  if (departments.Masters && departments.Masters.length > 0) {
    result.push({ category: 'Masters', departments: departments.Masters });
  }

  // Add Bachelors departments
  if (departments.Bachelors && departments.Bachelors.length > 0) {
    result.push({ category: 'Bachelors', departments: departments.Bachelors });
  }

  return result;
};

// Function to search departments within a faculty
export const searchDepartments = async (
  facultyName: string, 
  query: string
): Promise<{ category: string; departments: string[] }[]> => {
  // If query is empty, return all departments for the faculty
  if (!query) {
    return await getFacultyDepartments(facultyName);
  }
  
  const faculty = await getFacultyByName(facultyName);
  if (!faculty) return [];
  
  const departments = faculty.departments;
  const filtered: { category: string; departments: string[] }[] = [];
  const lowerQuery = query.toLowerCase();
  
  // Filter Masters departments
  if (departments.Masters) {
    const filteredMasters = departments.Masters.filter(dept =>
      dept.toLowerCase().includes(lowerQuery)
    );
    if (filteredMasters.length > 0) {
      filtered.push({ category: 'Masters', departments: filteredMasters });
    }
  }

  // Filter Bachelors departments
  if (departments.Bachelors) {
    const filteredBachelors = departments.Bachelors.filter(dept =>
      dept.toLowerCase().includes(lowerQuery)
    );
    if (filteredBachelors.length > 0) {
      filtered.push({ category: 'Bachelors', departments: filteredBachelors });
    }
  }

  return filtered;
};