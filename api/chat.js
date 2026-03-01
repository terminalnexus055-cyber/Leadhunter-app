export const config = { runtime: 'edge' };

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const body = await req.json();
    const { type, prompt, generationConfig, searchQuery, niche } = body;

    // ── REDDIT SEARCH via SerpApi + cx ────────────────────────────────────
    if (type === 'reddit_search') {
      const SERP_KEY = process.env.SERP_API_KEY;
      const CX = process.env.GOOGLE_CX;

      if (!SERP_KEY) {
        return new Response(JSON.stringify({ error: 'SerpApi not configured' }), { status: 500, headers });
      }
      if (!CX) {
        return new Response(JSON.stringify({ error: 'Search Engine ID not configured' }), { status: 500, headers });
      }

      // Multiple buying signal queries
      const queries = [
        `site:reddit.com ${searchQuery} looking for recommendations`,
        `site:reddit.com ${searchQuery} need help willing to pay`,
        `site:reddit.com ${niche} anyone recommend best tool`,
        `site:reddit.com ${searchQuery} struggling need solution`,
      ];

      const allResults = [];
      const seenUrls = new Set();

      for (const q of queries) {
        try {
          // SerpApi with cx (Search Engine ID) for targeted Reddit search
          const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${SERP_KEY}&cx=${CX}&num=5&engine=google`;
          const serpRes = await fetch(serpUrl);
          const serpData = await serpRes.json();

          if (serpData.organic_results) {
            for (const result of serpData.organic_results) {
              if (
                result.link &&
                result.link.includes('reddit.com') &&
                !seenUrls.has(result.link)
              ) {
                seenUrls.add(result.link);

                // Extract subreddit from URL
                const urlParts = result.link.split('/');
                const rIdx = urlParts.indexOf('r');
                const subreddit = rIdx > -1 && urlParts[rIdx + 1]
                  ? `r/${urlParts[rIdx + 1]}`
                  : 'r/entrepreneur';

                // Extract username if in URL
                const uIdx = urlParts.indexOf('u');
                const username = uIdx > -1 && urlParts[uIdx + 1]
                  ? urlParts[uIdx + 1]
                  : `u_${Math.random().toString(36).substr(2, 8)}`;

                allResults.push({
                  username,
                  subreddit,
                  postTitle: result.title || 'Reddit Post',
                  keyQuote: result.snippet || 'View post for full details',
                  url: result.link,
                  postedAgo: result.date || 'recently'
                });
              }
            }
          }
        } catch (e) {
          // Continue with next query if one fails
          continue;
        }
      }

      return new Response(JSON.stringify({ results: allResults }), { status: 200, headers });
    }

    // ── GEMINI AI ─────────────────────────────────────────────────────────
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API not configured' }), { status: 500, headers });
    }

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'No prompt provided' }), { status: 400, headers });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfig || {
          maxOutputTokens: 1500,
          temperature: 0.8
        }
      })
    });

    const data = await geminiRes.json();

    if (data.error) {
      return new Response(
        JSON.stringify({ error: data.error.message, code: data.error.code }),
        { status: 200, headers }
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return new Response(JSON.stringify({ text }), { status: 200, headers });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Server error: ' + err.message }),
      { status: 500, headers }
    );
  }
            }
              
