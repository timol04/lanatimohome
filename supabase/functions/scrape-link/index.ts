import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'No URL provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Abrufen der HTML-Inhalte (Mit Fake-User-Agent, damit Shops uns nicht als Bot blockieren)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Konnte Seite nicht laden (Status ${response.status})`);
    }

    const html = await response.text();

    // Regex-basiertes Auslesen der Meta-Tags
    const getMeta = (regexList) => {
      for (const regex of regexList) {
        const match = html.match(regex);
        if (match && match[1]) return match[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
      }
      return '';
    };

    const title = getMeta([
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ]);

    const image = getMeta([
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i
    ]);

    const description = getMeta([
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i
    ]);

    // Preis extrahieren (Schema.org / OpenGraph)
    let priceAmount = getMeta([/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i]);
    let priceCurrency = getMeta([/<meta[^>]*property="product:price:currency"[^>]*content="([^"]+)"/i]);
    
    let price = '';
    if (priceAmount) {
      price = `${priceAmount} ${priceCurrency || 'CHF'}`;
    } else {
      // Sehr grober Fallback für CH-Shops (sucht nach CHF XX.XX im Text)
      const chfMatch = html.match(/(?:CHF|Fr\.)\s*(\d+[\.\,]\d{2}|\d+)/i);
      if (chfMatch) price = `CHF ${chfMatch[1]}`;
    }

    return new Response(JSON.stringify({
      title,
      image,
      description,
      price
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
