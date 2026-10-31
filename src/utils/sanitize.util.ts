import sanitize from 'sanitize-html';
import { AppError } from '@/utils/app-error';

export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'a',
  'h2',
  'h3',
  'h4',
  'blockquote',
];

export const ALLOWED_ATTRIBUTES: sanitize.IOptions['allowedAttributes'] = {
  a: ['href', 'rel', 'target', 'title'],
};

export const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/**
 * Sanitizes rich text HTML description, blocking scripts, event handlers, iframes, styles, and javascript: links.
 */
export function sanitizeDescription(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') {
    return '';
  }

  return sanitize(dirtyHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: {
      a: ALLOWED_SCHEMES,
    },
    transformTags: {
      a: (tagName, attribs) => {
        // Enforce rel="noopener noreferrer" for security on all hyperlinks
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
          },
        };
      },
    },
    nonTextTags: [
      'style',
      'script',
      'textarea',
      'option',
      'noscript',
      'iframe',
      'object',
      'embed',
      'svg',
      'button',
    ],
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Validates that videoUrl is strictly HTTPS and from approved platforms (YouTube or Vimeo),
 * and normalizes the link into a standard embed URL.
 * Rejects all other domains, protocols, or invalid formats.
 */
export function validateAndNormalizeVideoUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return null;
  }

  const trimmed = rawUrl.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw AppError.badRequest('Invalid video URL format. Must be a valid HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw AppError.badRequest('Video URL must use secure HTTPS protocol.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // YouTube standard watch or embed URLs
  if (
    hostname === 'youtube.com' ||
    hostname === 'www.youtube.com' ||
    hostname === 'm.youtube.com'
  ) {
    let videoId: string | null = null;

    if (parsedUrl.pathname === '/watch') {
      videoId = parsedUrl.searchParams.get('v');
    } else if (parsedUrl.pathname.startsWith('/embed/')) {
      videoId = parsedUrl.pathname.replace('/embed/', '').split('/')[0] ?? null;
    } else if (parsedUrl.pathname.startsWith('/shorts/')) {
      videoId = parsedUrl.pathname.replace('/shorts/', '').split('/')[0] ?? null;
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
      throw AppError.badRequest('Invalid YouTube video URL. Missing or malformed video ID.');
    }

    return `https://www.youtube.com/embed/${videoId}`;
  }

  // YouTube short URLs (youtu.be/VIDEO_ID)
  if (hostname === 'youtu.be') {
    const videoId = parsedUrl.pathname.replace(/^\//, '').split('/')[0] ?? null;
    if (!videoId || !/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
      throw AppError.badRequest('Invalid youtu.be video URL. Missing or malformed video ID.');
    }
    return `https://www.youtube.com/embed/${videoId}`;
  }

  // Vimeo standard and player URLs
  if (
    hostname === 'vimeo.com' ||
    hostname === 'www.vimeo.com' ||
    hostname === 'player.vimeo.com'
  ) {
    let videoId: string | null;

    if (hostname === 'player.vimeo.com' && parsedUrl.pathname.startsWith('/video/')) {
      videoId = parsedUrl.pathname.replace('/video/', '').split('/')[0] ?? null;
    } else {
      videoId = parsedUrl.pathname.replace(/^\//, '').split('/')[0] ?? null;
    }

    if (!videoId || !/^\d{4,15}$/.test(videoId)) {
      throw AppError.badRequest('Invalid Vimeo video URL. Missing or malformed numeric video ID.');
    }

    return `https://player.vimeo.com/video/${videoId}`;
  }

  throw AppError.badRequest(
    `Unsupported video host: ${hostname}. Allowed video providers are YouTube and Vimeo.`,
  );
}
