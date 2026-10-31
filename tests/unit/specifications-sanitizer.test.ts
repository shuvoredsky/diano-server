import { describe, it, expect } from 'vitest';
import { sanitizeDescription, validateAndNormalizeVideoUrl } from '@/utils/sanitize.util';
import { validateProductSpecifications } from '@/modules/categories/categories.specifications';
import type { SpecificationFieldDefinition } from '@/modules/categories/categories.types';
import { AppError } from '@/utils/app-error';

describe('Sanitization & Specification Validation (Unit Tests)', () => {
  describe('HTML Description Sanitizer (XSS Prevention)', () => {
    it('should strip script tags and event handlers completely', () => {
      const maliciousHtml =
        '<p>Great cotton shirt</p><script>alert("XSS")</script><img src="x" onerror="alert(1)" /><button onclick="fetch(\'/steal\')">Click</button>';

      const sanitized = sanitizeDescription(maliciousHtml);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).toBe('<p>Great cotton shirt</p>');
    });

    it('should strip iframe and style tags', () => {
      const untrusted =
        '<iframe src="https://evil.com"></iframe><style>body { display: none; }</style><p>Valid text</p>';

      const sanitized = sanitizeDescription(untrusted);

      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).not.toContain('<style');
      expect(sanitized).toBe('<p>Valid text</p>');
    });

    it('should block javascript: pseudo-protocol in links', () => {
      const maliciousLink = '<a href="javascript:alert(\'pwned\')">Click here for discount</a>';

      const sanitized = sanitizeDescription(maliciousLink);

      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
    });

    it('should preserve allowed tags and add rel="noopener noreferrer" to hyperlinks', () => {
      const safeHtml =
        '<h2>Overview</h2><p>A <strong>premium</strong> <em>oxford</em> shirt.</p><ul><li>100% Cotton</li></ul><a href="https://example.com/care-guide">Care Guide</a>';

      const sanitized = sanitizeDescription(safeHtml);

      expect(sanitized).toContain('<h2>Overview</h2>');
      expect(sanitized).toContain('<strong>premium</strong>');
      expect(sanitized).toContain('<em>oxford</em>');
      expect(sanitized).toContain('<ul><li>100% Cotton</li></ul>');
      expect(sanitized).toContain('href="https://example.com/care-guide"');
      expect(sanitized).toContain('rel="noopener noreferrer"');
    });

    it('should handle null, undefined, or empty inputs gracefully', () => {
      expect(sanitizeDescription(null)).toBe('');
      expect(sanitizeDescription(undefined)).toBe('');
      expect(sanitizeDescription('')).toBe('');
      expect(sanitizeDescription('   ')).toBe('');
    });
  });

  describe('Video URL Validation & Normalization', () => {
    it('should normalize standard YouTube watch URLs', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const normalized = validateAndNormalizeVideoUrl(url);
      expect(normalized).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should normalize youtu.be short URLs', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      const normalized = validateAndNormalizeVideoUrl(url);
      expect(normalized).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('should normalize Vimeo standard URLs', () => {
      const url = 'https://vimeo.com/76979871';
      const normalized = validateAndNormalizeVideoUrl(url);
      expect(normalized).toBe('https://player.vimeo.com/video/76979871');
    });

    it('should reject non-HTTPS URLs', () => {
      expect(() =>
        validateAndNormalizeVideoUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toThrow('HTTPS');
    });

    it('should reject unapproved video hosts', () => {
      expect(() =>
        validateAndNormalizeVideoUrl('https://dailymotion.com/video/x7tgad0'),
      ).toThrow(AppError);

      try {
        validateAndNormalizeVideoUrl('https://evil-attacker.com/malicious.mp4');
      } catch (err: unknown) {
        expect((err as AppError).message).toContain('Unsupported video host');
      }
    });

    it('should reject malformed or missing video IDs', () => {
      expect(() => validateAndNormalizeVideoUrl('https://www.youtube.com/watch')).toThrow(
        'Missing or malformed',
      );
      expect(() => validateAndNormalizeVideoUrl('https://vimeo.com/not-a-number')).toThrow(
        'Missing or malformed numeric video ID',
      );
    });

    it('should return null for empty or undefined input', () => {
      expect(validateAndNormalizeVideoUrl(null)).toBeNull();
      expect(validateAndNormalizeVideoUrl(undefined)).toBeNull();
      expect(validateAndNormalizeVideoUrl('')).toBeNull();
    });
  });

  describe('Product Specifications Validation Against Category Template', () => {
    const mockTemplate: SpecificationFieldDefinition[] = [
      {
        key: 'colour',
        label: 'Colour',
        type: 'text',
        required: true,
        options: [],
        sortOrder: 1,
      },
      {
        key: 'fabric',
        label: 'Fabric',
        type: 'select',
        required: true,
        options: ['Cotton', 'Linen', 'Silk'],
        sortOrder: 2,
      },
      {
        key: 'threadCount',
        label: 'Thread Count',
        type: 'number',
        required: false,
        options: [],
        sortOrder: 3,
      },
      {
        key: 'notes',
        label: 'Care Notes',
        type: 'text',
        required: false,
        options: [],
        sortOrder: 4,
      },
    ];

    it('should validate and accept compliant specifications', () => {
      const input = {
        colour: 'Navy Blue',
        fabric: 'Cotton',
        threadCount: 300,
      };

      const result = validateProductSpecifications(input, mockTemplate);

      expect(result).toEqual({
        colour: 'Navy Blue',
        fabric: 'Cotton',
        threadCount: 300,
      });
    });

    it('should reject unknown specification keys', () => {
      const input = {
        colour: 'White',
        fabric: 'Cotton',
        unknownProperty: 'hacked',
      };

      expect(() => validateProductSpecifications(input, mockTemplate)).toThrow(
        'Unknown specification key: "unknownProperty"',
      );
    });

    it('should reject missing required specification fields', () => {
      const input = {
        colour: 'White',
        // fabric is required but omitted
      };

      expect(() => validateProductSpecifications(input, mockTemplate)).toThrow(
        'Missing required specification: "Fabric"',
      );
    });

    it('should reject invalid option in select fields', () => {
      const input = {
        colour: 'White',
        fabric: 'Nylon', // Not in ['Cotton', 'Linen', 'Silk']
      };

      expect(() => validateProductSpecifications(input, mockTemplate)).toThrow(
        'Invalid option for "Fabric"',
      );
    });

    it('should reject non-numeric values for number type fields', () => {
      const input = {
        colour: 'White',
        fabric: 'Cotton',
        threadCount: 'very-high',
      };

      expect(() => validateProductSpecifications(input, mockTemplate)).toThrow(
        'Specification "Thread Count" must be a valid number',
      );
    });

    it('should reject text values exceeding 500 characters', () => {
      const input = {
        colour: 'White',
        fabric: 'Cotton',
        notes: 'A'.repeat(501),
      };

      expect(() => validateProductSpecifications(input, mockTemplate)).toThrow(
        'exceeds maximum length of 500 characters',
      );
    });
  });
});
