'use client';

import { useMemo } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { BusData } from '@/app/admin/smart-allocation/page';

interface SankeyPreviewProps {
  fromBus: BusData;
  assignments: Array<{
    toBusId: string;
    toBusNumber: string;
    studentCount: number;
  }>;
}

export default function SankeyPreview({ fromBus, assignments }: SankeyPreviewProps) {
  const totalStudents = useMemo(() => 
    assignments.reduce((sum, a) => sum + a.studentCount, 0),
    [assignments]
  );

  return (
    <div className="w-full p-4">
      <svg width="100%" height={Math.max(120, assignments.length * 50)} className="overflow-visible">
        <defs>
          <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9333ea" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Source Node */}
        <g transform="translate(20, 60)">
          <rect
            x={0}
            y={-30}
            width={100}
            height={60}
            rx={8}
            fill="rgba(239, 68, 68, 0.1)"
            stroke="#ef4444"
            strokeWidth={2}
          />
          <text x={50} y={-5} textAnchor="middle" className="fill-gray-100 text-sm font-semibold">
            {fromBus.busNumber}
          </text>
          <text x={50} y={15} textAnchor="middle" className="fill-gray-400 text-xs">
            {totalStudents} students
          </text>
        </g>

        {/* Target Nodes & Flows */}
        {assignments.map((assignment, index) => {
          const yPos = 30 + (index * 50);
          const flowHeight = Math.max(5, (assignment.studentCount / totalStudents) * 40);
          const flowY = yPos - flowHeight / 2;

          return (
            <g key={assignment.toBusId}>
              {/* Flow Path */}
              <motion.path
                initial={{ opacity: 0, pathLength: 0 }}
                animate={{ opacity: 1, pathLength: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                d={`M 120 60 Q 180 60 180 ${yPos} L 240 ${yPos}`}
                stroke="url(#flowGradient)"
                strokeWidth={flowHeight}
                fill="none"
                strokeLinecap="round"
              />

              {/* Flow Label */}
              <motion.text
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 + 0.3 }}
                x={180}
                y={yPos - flowHeight/2 - 5}
                textAnchor="middle"
                className="fill-purple-400 text-xs font-semibold"
              >
                {assignment.studentCount}
              </motion.text>

              {/* Target Node */}
              <motion.g
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
                transform={`translate(240, ${yPos})`}
              >
                <rect
                  x={0}
                  y={-20}
                  width={100}
                  height={40}
                  rx={8}
                  fill="rgba(16, 185, 129, 0.1)"
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <text x={50} y={-2} textAnchor="middle" className="fill-gray-100 text-sm font-semibold">
                  {assignment.toBusNumber}
                </text>
                <text x={50} y={14} textAnchor="middle" className="fill-gray-400 text-xs">
                  +{assignment.studentCount}
                </text>
              </motion.g>
            </g>
          );
        })}
      </svg>

      {/* Summary */}
      <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">
              Reassigning {totalStudents} students to {assignments.length} bus{assignments.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-purple-400" />
        </div>
      </div>
    </div>
  );
}
