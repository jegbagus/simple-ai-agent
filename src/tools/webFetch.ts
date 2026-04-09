import axios from 'axios';
import { load } from 'cheerio';

const MAX_CHARS = 8000;

export async function webFetch(url: string): Promise<string> {
  try {
    const response = await axios.get<string>(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15_000,
      responseType: 'text',
    });

    const contentType: string = response.headers['content-type'] ?? '';

    let text: string;
    if (contentType.includes('text/html')) {
      const $ = load(response.data);
      $('script, style, nav, footer, header, aside').remove();
      text = $('body').text();
      // Collapse blank lines
      text = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
    } else {
      text = response.data;
    }

    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + `\n\n[... truncated at ${MAX_CHARS} chars]`;
    }

    return text || '(no readable content)';
  } catch (e: any) {
    if (e.response) {
      return `HTTP error ${e.response.status} fetching ${url}`;
    }
    return `Error fetching ${url}: ${e.message}`;
  }
}
