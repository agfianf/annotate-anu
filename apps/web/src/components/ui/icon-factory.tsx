import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { HugeiconsIcon, type HugeiconsProps, type IconSvgElement } from '@hugeicons/react';
import { cn } from '@/lib/utils';

/**
 * Props accepted by every icon in `@/components/ui/icons`.
 *
 * Deliberately drops the HugeIcons-specific `icon`/`altIcon`/`showAlt` props: each
 * exported icon binds its own glyph, so call sites only pass presentation props
 * (`className`, `size`, `strokeWidth`, `style`, event handlers, `ref`, ...).
 */
export type IconProps = Omit<HugeiconsProps, 'icon' | 'altIcon' | 'showAlt'>;

/** An icon component. Use this where a registry stores an icon as a value. */
export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

/**
 * How an icon reacts when its button, link, or itself is hovered.
 *
 * The motion is described here but implemented in `index.css`, so hover state can be
 * read from the enclosing control — a 16px glyph is too small to be a hover target.
 * `none` opts out, for icons that already carry their own animation.
 */
export type IconMotion = 'lift' | 'spin' | 'pop' | 'wiggle' | 'left' | 'right' | 'up' | 'down' | 'none';

/**
 * Binds one HugeIcons glyph into a self-contained component.
 *
 * Colour and size come from the caller's `className` — the glyphs use
 * `currentColor`, so the existing Tailwind `text-*` / `w-* h-*` classes keep working.
 */
export function icon(glyph: IconSvgElement, name: string, motion: IconMotion = 'lift'): IconComponent {
  const motionClass = motion === 'none' ? undefined : `anu-icon anu-icon--${motion}`;

  const Component = forwardRef<SVGSVGElement, IconProps>(({ className, ...props }, ref) => (
    <HugeiconsIcon ref={ref} icon={glyph} className={cn(motionClass, className)} {...props} />
  ));
  Component.displayName = name;
  return Component;
}
