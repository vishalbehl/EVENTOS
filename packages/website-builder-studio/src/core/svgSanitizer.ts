/**
 * Secure SVG Sanitizer for Website Builder Studio
 * Strips script tags, inline event handlers, foreignObject, and unsafe hrefs.
 */

const DANGEROUS_TAGS = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'applet', 'meta', 'link'];
const DANGEROUS_ATTRIBUTES = [
  /^on[a-z]+/i, // onclick, onerror, onload, onmouseover, etc.
  /^formaction$/i,
  /^xlink:href$/i, // We sanitize xlink:href separately
];

export function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg || typeof rawSvg !== 'string') return '';

  let cleaned = rawSvg;

  // 1. Remove dangerous XML/HTML tags and their contents
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?<\/${tag}>)?`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // 2. Remove all inline on* event handler attributes
  cleaned = cleaned.replace(/\s+on[a-zA-Z]+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '');

  // 3. Remove javascript: or vbscript: or data:text/html URIs in href and xlink:href
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*['"]\s*(javascript|vbscript|data:\s*text\/html)[^'"]*['"]/gi, '$1="#"');

  // 4. Remove external references in <use> tags
  cleaned = cleaned.replace(/<use\s+([^>]*?)href=['"](?!#)[^'"]+['"]([^>]*?)>/gi, '<use $1 href="#invalid" $2>');

  // 5. Ensure root starts with <svg and contains valid XML/SVG structure
  const svgStart = cleaned.indexOf('<svg');
  if (svgStart === -1) return '';

  return cleaned.slice(svgStart);
}
