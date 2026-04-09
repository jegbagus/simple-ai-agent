import { TAVILY_API_KEY } from '../config.js';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export async function webSearch(query: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    return 'Error: TAVILY_API_KEY is not set. Cannot perform web search.';
  }

  try {
    const { tavily } = await import('@tavily/core');
    const client = tavily({ apiKey: TAVILY_API_KEY });
    const response = await client.search(query, { maxResults: 5 });

    const results: TavilyResult[] = (response as any).results ?? [];
    if (results.length === 0) return 'No results found.';

    return results
      .map((r, i) => {
        const snippet = r.content?.slice(0, 300) ?? '';
        return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${snippet}`;
      })
      .join('\n\n');
  } catch (e) {
    return `Error during web search: ${e}`;
  }
}
