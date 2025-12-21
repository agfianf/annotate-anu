import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FilepathFilterProps {
  currentValue: string;
  onChange: (value: string) => void;
}

export function FilepathFilter({ currentValue, onChange }: FilepathFilterProps) {
  const [localValue, setLocalValue] = useState(currentValue);

  useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  const commitChange = () => {
    if (localValue !== currentValue) {
      onChange(localValue);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <label className="text-[9px] text-emerald-900/50 font-mono uppercase tracking-wider mb-1 block">Filepath Pattern</label>
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commitChange}
          onKeyDown={(e) => e.key === 'Enter' && commitChange()}
          placeholder="/path/to/*.jpg"
          className="w-full px-2 py-1.5 text-[10px] bg-white border border-emerald-200 text-emerald-900 placeholder-emerald-900/20 focus:outline-none focus:border-emerald-500 focus:bg-emerald-50 font-mono transition-colors"
        />
        {localValue && (
          <button
            onClick={() => {
              setLocalValue('');
              onChange('');
            }}

            className="absolute right-2 bottom-1.5 text-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      
      <p className="text-[9px] text-emerald-900/40 font-mono">
        Wildcards: * (any), ? (single)
      </p>
    </div>
  );
}
