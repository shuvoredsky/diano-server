import { AppError } from './app-error';

/**
 * Asserts that an entity fetched from a repository exists, otherwise throws a 404 AppError.notFound.
 * Eliminates repetitive `if (!entity) throw AppError.notFound(...)` checks across all services.
 * 
 * @example
 * const user = ensureFound(await repo.findUserById(id), 'User', id);
 */
export function ensureFound<T>(
  entity: T | null | undefined,
  entityName: string,
  identifier?: string,
): NonNullable<T> {
  if (entity === null || entity === undefined) {
    const message = identifier
      ? `${entityName} with ID '${identifier}' not found`
      : `${entityName} not found`;
    throw AppError.notFound(message);
  }
  return entity as NonNullable<T>;
}
