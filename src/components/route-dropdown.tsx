import React from 'react';

// Route data
const routeData = {
  "AS-01-FC-7127": [
    "Garchuk", "ISBT", "Lokhra", "Nalapara", "Beharbari", "Lalmati",
    "Basistha Charili", "A.G. Bus Stop", "Beltola Tiniali", "Nandanpur Path",
    "Survey", "Wireless", "Last Gate", "Ganesh Mandir", "Ganeshguri",
    "Zoo Tiniali", "Geeta Mandir P.S.", "Hatigarh Chariali", "Geetamandir",
    "Mothghoria", "Narengi", "Panikhati Campus"
  ],
  "AS-01-FC-7128": [
    "Jalukbari", "Adabari Tiniali", "Maligaon", "Maligaon No. 3",
    "Kamakhya Gate", "Bhootnath", "Bharalumukh", "Fancy Bazar", "Kachari",
    "Guwahati Club", "Goswami Service", "Chandmari", "Anuradha",
    "New Guwahati", "Noonmati", "Narengi", "Panikhati Campus"
  ],
  "AS-01-DD-2697": [
    "down town Hospital", "Sixmile", "Barbari", "Pratiksha Hospital",
    "Magzine", "Patharkuwari", "Narengi", "Panikhati Campus"
  ],
  "AS-01-KC-0757": [
    "A.T Road", "Paltan Bazar", "Ulubari", "Lachitnagar", "Bhangagarh",
    "Post Office", "Christian Basti", "Ganeshguri", "down town", "Sixmile",
    "Chandan-Nagar", "Barbari", "Patharkuwari", "Narengi", "Panikhati Campus"
  ],
  "AS-01-LC-5321": [
    "Kerakuchi", "Ghoramara", "Bhetapara", "Hatigoan P.S", "Hatigoan Bus Stop",
    "High School", "Sewali Path", "Lakhimi Nagar", "Rajdhani Masjid", "Jonali",
    "Gitanagar PS", "B G Tiniali", "Motghoria", "Panikhati Campus"
  ],
  "AS-01-DD-9704": [
    "Guwahati Club", "Silpukhuri", "Goswami Service", "Chandmari Fly Over",
    "Anuradha", "FCI", "New Guwahati", "Noonmati", "Sector-3", "Carbon Gate",
    "Narengi", "Panikhati Campus"
  ],
  "AS-01-DD-2696": [
    "down town Hospital", "Sixmile", "Chandan-nagar", "Barbari",
    "Pratiksha Hospital", "Magzine", "Patharkuwari", "Narengi", "Panikhati Campus"
  ],
  "AS-01-DD-9705": [
    "Khanapara", "Farm Gate", "Sixmile", "Chandan-nagar", "Barbari",
    "Pratiksha Hospital", "Patharkuwari", "Narengi", "Panikhati Campus"
  ],
  "AS-01-HC-4906": [
    "Lal-Ganesh", "Kahilipara", "Ganeshguri", "Ganesh Mandir", "Nursery",
    "State Zoo", "Zoo Tiniali", "Gitanagar PS", "Hatigarh Chariali", "Narengi",
    "Panikhati Campus"
  ],
  "AS-01-JC-5827": [
    "Maligaon Gate No. 3", "Kamakhya Gate", "Kalipur", "Bhootnath",
    "Bharalumukh", "Fancy Bazar", "Kachari", "Guwahati Club", "Goswami Service",
    "Chandmari", "Gauhati Commerce College", "Zoo Road Tiniali", "Gitanagar PS",
    "Narengi", "Panikhati Campus"
  ],
  "AS-01-FC-1173": [
    "down town Hospital", "Super Market", "Last gate", "Rajdhani Masjid",
    "Ganeshguri Mandir", "Ganeshguri", "Nursery", "State Zoo", "Jonali",
    "Zoo Tiniali", "Gitanagar PS", "Hatigarh Chariali", "Geeta Mandir",
    "B G Tiniali", "Motghoria", "Narengi", "Panikhati Campus"
  ],
  "AS-01-FC-1172": [
    "down town Hospital", "Sixmile", "Chandan-nagar", "Barbari",
    "Pratiksha Hospital", "Magzine", "Patharkuwari", "Narengi", "Panikhati Campus"
  ]
};

interface RouteDropdownProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export default function RouteDropdown({ id, value, onChange, required = false }: RouteDropdownProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
    >
      <option value="">Select a Route</option>
      {Object.entries(routeData).map(([busNumber, stops]) => (
        <option key={busNumber} value={`${busNumber}: ${stops.join(', ')}`}>
          {busNumber}: {stops.join(', ')}
        </option>
      ))}
    </select>
  );
}