export function sourceFileForNode(node) {
  return String(node?.sourceFile || node?.source_file || node?._source_file || node?.file || '');
}

export function searchGraphNodes({ query = '', nodes = [], limit = 20 } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  return (nodes || [])
    .map((node) => {
      const id = String(node?.id ?? '');
      const label = String(node?.label || node?.title || id || 'Untitled');
      const sourceFile = sourceFileForNode(node);
      const score = scoreSearchMatch({
        query: normalizedQuery,
        id,
        label,
        sourceFile
      });
      return {
        node,
        id,
        label,
        sourceFile,
        score
      };
    })
    .filter((item) => item.id && item.score !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

export function scoreSearchMatch({ query = '', id = '', label = '', sourceFile = '' } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return null;
  }

  const normalizedLabel = normalizeSearchText(label);
  const normalizedSource = normalizeSearchText(sourceFile);
  const normalizedId = normalizeSearchText(id);
  const haystack = [normalizedLabel, normalizedSource, normalizedId].filter(Boolean).join(' ');

  if (normalizedLabel === normalizedQuery) {
    return 0;
  }
  if (normalizedLabel.startsWith(normalizedQuery)) {
    return 10;
  }
  if (normalizedLabel.split(' ').some((token) => token.startsWith(normalizedQuery))) {
    return 20;
  }
  if (normalizedLabel.includes(normalizedQuery)) {
    return 30;
  }
  if (normalizedSource.includes(normalizedQuery)) {
    return 45;
  }
  if (normalizedId.includes(normalizedQuery)) {
    return 55;
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  if (queryTokens.length > 1 && queryTokens.every((token) => haystack.includes(token))) {
    return 70;
  }

  return null;
}

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
