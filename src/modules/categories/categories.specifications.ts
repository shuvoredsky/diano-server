import { AppError } from '@/utils/app-error';
import type { SpecificationFieldDefinition } from './categories.types';

/**
 * Validates product specifications against a category's specification template.
 * - Rejects any unknown keys not declared in the category template.
 * - Rejects missing required specification fields.
 * - Enforces data type checks (number, select with options, text with max length 500).
 */
export function validateProductSpecifications(
  specifications: Record<string, unknown> | null | undefined,
  template: SpecificationFieldDefinition[],
): Record<string, string | number> {
  const specs = specifications ?? {};
  const templateMap = new Map<string, SpecificationFieldDefinition>();

  for (const field of template) {
    templateMap.set(field.key.toLowerCase(), field);
  }

  // 1. Check for unknown keys
  const allowedKeys = Array.from(templateMap.values()).map(f => f.key);
  for (const key of Object.keys(specs)) {
    if (!templateMap.has(key.toLowerCase())) {
      throw AppError.badRequest(
        `Unknown specification key: "${key}". Allowed keys for this category: ${
          allowedKeys.length > 0 ? allowedKeys.join(', ') : 'none'
        }`,
      );
    }
  }

  // 2. Check required fields and validate types
  const validated: Record<string, string | number> = {};

  for (const field of template) {
    const rawVal = specs[field.key] ?? specs[field.key.toLowerCase()];

    if (
      rawVal === undefined ||
      rawVal === null ||
      (typeof rawVal === 'string' && rawVal.trim() === '')
    ) {
      if (field.required) {
        throw AppError.badRequest(
          `Missing required specification: "${field.label}" (${field.key})`,
        );
      }
      continue;
    }

    switch (field.type) {
      case 'number': {
        const num = Number(rawVal);
        if (isNaN(num)) {
          throw AppError.badRequest(
            `Specification "${field.label}" must be a valid number, received: ${String(rawVal)}`,
          );
        }
        validated[field.key] = num;
        break;
      }

      case 'select': {
        const strVal = String(rawVal).trim();
        if (field.options && field.options.length > 0) {
          const match = field.options.find(opt => opt.toLowerCase() === strVal.toLowerCase());
          if (!match) {
            throw AppError.badRequest(
              `Invalid option for "${field.label}". Received "${strVal}", allowed: ${field.options.join(
                ', ',
              )}`,
            );
          }
          validated[field.key] = match;
        } else {
          validated[field.key] = strVal;
        }
        break;
      }

      case 'text':
      default: {
        const strVal = String(rawVal).trim();
        if (strVal.length > 500) {
          throw AppError.badRequest(
            `Specification "${field.label}" exceeds maximum length of 500 characters`,
          );
        }
        validated[field.key] = strVal;
        break;
      }
    }
  }

  return validated;
}
