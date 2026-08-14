import type { PropertyDefinition } from '../PropertyRegistry';

export const TypographyGroup: PropertyDefinition[] = [
  {
    id: 'font-family',
    type: 'Select',
    label: 'Font Family',
    target: { kind: 'style', css: 'font-family' },
    options: [
      { value: "'Inter', sans-serif", label: 'Inter' },
      { value: "'Roboto', sans-serif", label: 'Roboto' },
      { value: "'Outfit', sans-serif", label: 'Outfit' },
      { value: "'Poppins', sans-serif", label: 'Poppins' },
      { value: "'Montserrat', sans-serif", label: 'Montserrat' },
      { value: "'Playfair Display', serif", label: 'Playfair Display' },
      { value: "'Georgia', serif", label: 'Georgia' },
      { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
    ],
  },
  { id: 'font-size', type: 'Text', label: 'Font Size', placeholder: 'e.g. 16px, 1.5rem, 2em', target: { kind: 'style', css: 'font-size' } },
  {
    id: 'font-weight',
    type: 'Select',
    label: 'Font Weight',
    target: { kind: 'style', css: 'font-weight' },
    options: [
      { value: '300', label: '300 — Light' },
      { value: '400', label: '400 — Normal' },
      { value: '500', label: '500 — Medium' },
      { value: '600', label: '600 — Semi Bold' },
      { value: '700', label: '700 — Bold' },
      { value: '800', label: '800 — Extra Bold' },
      { value: '900', label: '900 — Black' },
    ],
  },
  {
    id: 'text-align',
    type: 'Select',
    label: 'Text Align',
    target: { kind: 'style', css: 'text-align' },
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
      { value: 'justify', label: 'Justify' },
    ],
  },
  {
    id: 'text-transform',
    type: 'Select',
    label: 'Text Transform',
    target: { kind: 'style', css: 'text-transform' },
    options: [
      { value: 'none', label: 'None' },
      { value: 'uppercase', label: 'Uppercase' },
      { value: 'lowercase', label: 'Lowercase' },
      { value: 'capitalize', label: 'Capitalize' },
    ],
  },
  { id: 'color', type: 'Color', label: 'Text Color', target: { kind: 'style', css: 'color' } },
  { id: 'line-height', type: 'Text', label: 'Line Height', placeholder: 'e.g. 1.6, 24px', target: { kind: 'style', css: 'line-height' } },
  { id: 'letter-spacing', type: 'Text', label: 'Letter Spacing', placeholder: 'e.g. 0.05em, 1px', target: { kind: 'style', css: 'letter-spacing' } },
  {
    id: 'text-decoration',
    type: 'Select',
    label: 'Decoration',
    target: { kind: 'style', css: 'text-decoration' },
    options: [
      { value: 'none', label: 'None' },
      { value: 'underline', label: 'Underline' },
      { value: 'line-through', label: 'Strikethrough' },
    ],
  },
];
