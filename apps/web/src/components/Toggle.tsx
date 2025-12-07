import { motion } from 'framer-motion';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
}

export default function Toggle({ 
    checked, 
    onChange, 
    label, 
    size = 'md',
    disabled = false 
}: ToggleProps) {
    const getSizeClasses = () => {
        switch (size) {
            case 'sm': return {
                container: 'w-9 h-5',
                knob: 'w-3.5 h-3.5',
                translateX: 16
            };
            case 'lg': return {
                container: 'w-14 h-8',
                knob: 'w-6 h-6',
                translateX: 24
            };
            default: return {
                container: 'w-11 h-6',
                knob: 'w-4 h-4',
                translateX: 20
            };
        }
    };

    const sizes = getSizeClasses();

    return (
        <label className={`flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <div className="relative flex items-center">
                <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) => !disabled && onChange(e.target.checked)}
                    disabled={disabled}
                />
                <div
                    className={`
                        ${sizes.container} 
                        rounded-full shadow-inner transition-colors duration-300 ease-in-out
                        ${checked ? 'bg-emerald-500' : 'bg-gray-200'}
                    `}
                ></div>
                <motion.div
                    className={`
                        absolute left-1 bg-white rounded-full shadow-md
                        ${sizes.knob}
                    `}
                    animate={{
                        x: checked ? sizes.translateX : 0
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30
                    }}
                />
            </div>
            {label && (
                <span className={`font-medium text-gray-700 select-none ${
                    size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
                }`}>
                    {label}
                </span>
            )}
        </label>
    );
}
