/**
 * OptimizedInput - Prevents parent re-renders during typing
 * Uses internal state for immediate feedback, syncs to parent on blur
 */

"use client";

import { useState, useCallback, useEffect, memo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OptimizedInputProps {
  id: string;
  label?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  transform?: (value: string) => string;
}

export const OptimizedInput = memo(function OptimizedInput({
  id,
  label,
  type = 'text',
  value: externalValue,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  transform
}: OptimizedInputProps) {
  const [internalValue, setInternalValue] = useState(externalValue);

  // Sync external value changes (e.g., from hydration)
  useEffect(() => {
    setInternalValue(externalValue);
  }, [externalValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    if (transform) {
      newValue = transform(newValue);
    }
    setInternalValue(newValue);
  }, [transform]);

  const handleBlur = useCallback(() => {
    // Only call onChange if value actually changed
    if (internalValue !== externalValue) {
      onChange(internalValue);
    }
  }, [internalValue, externalValue, onChange]);

  return (
    <div>
      {label && (
        <Label htmlFor={id} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
          {label} {required && <span>*</span>}
        </Label>
      )}
      <Input
        type={type}
        id={id}
        value={internalValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className || "text-xs h-9"}
      />
    </div>
  );
});

