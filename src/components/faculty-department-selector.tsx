"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { searchFaculties, searchDepartments, getFacultyDepartments, Faculty } from '@/lib/facultyService';

interface FacultyDepartmentSelectorProps {
  onFacultySelect: (faculty: string) => void;
  onDepartmentSelect: (department: string) => void;
  initialFaculty?: string;
  initialDepartment?: string;
}

const FacultyDepartmentSelector: React.FC<FacultyDepartmentSelectorProps> = ({
  onFacultySelect,
  onDepartmentSelect,
  initialFaculty = '',
  initialDepartment = ''
}) => {
  const [facultyInput, setFacultyInput] = useState(initialFaculty);
  const [departmentInput, setDepartmentInput] = useState(initialDepartment);
  const [filteredFaculties, setFilteredFaculties] = useState<Faculty[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<{ category: string; departments: string[] }[]>([]);
  const [showFacultySuggestions, setShowFacultySuggestions] = useState(false);
  const [showDepartmentSuggestions, setShowDepartmentSuggestions] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(initialFaculty || null);
  const [loadingFaculties, setLoadingFaculties] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [facultySelected, setFacultySelected] = useState(!!initialFaculty);
  const [allFaculties, setAllFaculties] = useState<Faculty[]>([]); // Store all faculties
  const facultyRef = useRef<HTMLDivElement>(null);
  const departmentRef = useRef<HTMLDivElement>(null);

  // Reset internal state when initial props change
  useEffect(() => {
    setFacultyInput(initialFaculty);
    setDepartmentInput(initialDepartment);
    setSelectedFaculty(initialFaculty || null);
    setFacultySelected(!!initialFaculty);
  }, [initialFaculty, initialDepartment]);

  // Load all faculties when component mounts
  useEffect(() => {
    const loadAllFaculties = async () => {
      try {
        const faculties = await searchFaculties(''); // Empty query returns all faculties
        setAllFaculties(faculties);
        // Show all faculties when input is empty
        if (!facultyInput.trim()) {
          setFilteredFaculties(faculties);
        }
      } catch (error) {
        console.error('Error loading faculties:', error);
      }
    };

    loadAllFaculties();
  }, []);

  // Filter faculties based on input
  useEffect(() => {
    const filterFaculties = async () => {
      if (facultyInput.trim() === '') {
        // Show all faculties when input is empty
        setFilteredFaculties(allFaculties);
        return;
      }

      setLoadingFaculties(true);
      try {
        const filtered = await searchFaculties(facultyInput);
        setFilteredFaculties(filtered);
      } catch (error) {
        console.error('Error filtering faculties:', error);
        setFilteredFaculties([]);
      } finally {
        setLoadingFaculties(false);
      }
    };

    const timeoutId = setTimeout(filterFaculties, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [facultyInput, allFaculties]);

  // Filter departments based on input and selected faculty
  useEffect(() => {
    const filterDepartments = async () => {
      if (!selectedFaculty) {
        setFilteredDepartments([]);
        return;
      }

      // If department input is empty, show all departments for the selected faculty
      if (departmentInput.trim() === '') {
        setLoadingDepartments(true);
        try {
          const allDepts = await getFacultyDepartments(selectedFaculty);
          setFilteredDepartments(allDepts);
        } catch (error) {
          console.error('Error loading departments:', error);
          setFilteredDepartments([]);
        } finally {
          setLoadingDepartments(false);
        }
        return;
      }

      // If department input has text, filter departments
      setLoadingDepartments(true);
      try {
        const filtered = await searchDepartments(selectedFaculty, departmentInput);
        setFilteredDepartments(filtered);
      } catch (error) {
        console.error('Error filtering departments:', error);
        setFilteredDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };

    const timeoutId = setTimeout(filterDepartments, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [departmentInput, selectedFaculty]);

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (facultyRef.current && !facultyRef.current.contains(event.target as Node)) {
        setShowFacultySuggestions(false);
      }
      if (departmentRef.current && !departmentRef.current.contains(event.target as Node)) {
        setShowDepartmentSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFacultySelect = (faculty: Faculty) => {
    setFacultyInput(faculty.faculty);
    setSelectedFaculty(faculty.faculty);
    setFacultySelected(true);
    setShowFacultySuggestions(false);
    setDepartmentInput('');
    onFacultySelect(faculty.faculty);
  };

  const handleDepartmentSelect = (department: string) => {
    setDepartmentInput(department);
    setShowDepartmentSuggestions(false);
    onDepartmentSelect(department);
  };

  const handleFacultyFocus = () => {
    // Show all faculties when focusing on the faculty input
    if (!facultyInput.trim()) {
      setFilteredFaculties(allFaculties);
    }
    setShowFacultySuggestions(true);
  };

  const handleDepartmentFocus = () => {
    if (!facultySelected) {
      // Show a message or tooltip indicating that faculty must be selected first
      alert("Please select a faculty first");
      return;
    }
    setShowDepartmentSuggestions(true);
  };

  return (
    <div className="space-y-2">
      {/* Faculty Selector */}
      <div className="space-y-1" ref={facultyRef}>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Faculty</label>
        <div className="relative">
          <Input
            type="text"
            value={facultyInput}
            onChange={(e) => {
              setFacultyInput(e.target.value);
              setShowFacultySuggestions(true);
            }}
            onFocus={handleFacultyFocus}
            placeholder="Select or search faculty..."
            className="w-full text-xs h-9"
          />
          {showFacultySuggestions && (
            <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg dark:bg-gray-800 dark:border-gray-700">
              <div className="h-48 overflow-y-auto">
                {loadingFaculties ? (
                  <div className="px-3 py-1.5 text-center text-gray-500 text-[10px]">
                    Loading...
                  </div>
                ) : filteredFaculties.length > 0 ? (
                  <ul className="py-0.5">
                    {filteredFaculties.map((faculty) => (
                      <li
                        key={faculty.id}
                        className="px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => handleFacultySelect(faculty)}
                      >
                        {faculty.faculty}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-1.5 text-center text-gray-500 text-[10px]">
                    No faculties found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Department Selector */}
      <div className="space-y-1" ref={departmentRef}>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Department</label>
        <div className="relative">
          <Input
            type="text"
            value={departmentInput}
            onChange={(e) => {
              setDepartmentInput(e.target.value);
              if (facultySelected) {
                setShowDepartmentSuggestions(true);
              }
            }}
            onFocus={handleDepartmentFocus}
            placeholder={facultySelected ? "Select or search department..." : "Choose faculty first..."}
            className="w-full text-xs h-9"
            disabled={!facultySelected}
          />
          {showDepartmentSuggestions && facultySelected && (
            <div className="absolute z-10 w-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg dark:bg-gray-800 dark:border-gray-700">
              <div className="h-48 overflow-y-auto">
                {loadingDepartments ? (
                  <div className="px-3 py-1.5 text-center text-gray-500 text-[10px]">
                    Loading...
                  </div>
                ) : filteredDepartments.length > 0 ? (
                  <ul className="py-0.5">
                    {filteredDepartments.map((category) => (
                      <React.Fragment key={category.category}>
                        <li className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase dark:text-gray-400">
                          {category.category}
                        </li>
                        {category.departments.map((department, index) => (
                          <li
                            key={`${category.category}-${index}`}
                            className="px-6 py-1.5 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => handleDepartmentSelect(department)}
                          >
                            {department}
                          </li>
                        ))}
                      </React.Fragment>
                    ))}
                  </ul>
                ) : (
                  <div className="px-3 py-1.5 text-center text-gray-500 text-[10px]">
                    No departments found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FacultyDepartmentSelector;