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

    let html = '';
    let microlinkData = null;
    
    // Versuche direkten Fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
      }
    });
    
    if (response.ok) {
      html = await response.text();
    } else {
      // Fallback für Seiten mit aggressivem Bot-Schutz (z.B. Galaxus, Digitec)
      console.log(`Direct fetch failed (${response.status}), trying microlink fallback...`);
      const mlResponse = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
      if (mlResponse.ok) {
        const mlJson = await mlResponse.json();
        if (mlJson.status === 'success') {
          microlinkData = mlJson.data;
        }
      }
      
      if (!microlinkData) {
        throw new Error(`Konnte Seite nicht laden (Status ${response.status}) und Fallback schlug fehl`);
      }
    }

    // Regex-basiertes Auslesen der Meta-Tags (Die allererste Version, die 100% funktioniert hat)
    // Wenn Microlink erfolgreich war, nutzen wir deren Daten
    if (microlinkData) {
      let title = microlinkData.title || '';
      let image = microlinkData.image?.url || microlinkData.logo?.url || '';
      let description = microlinkData.description || '';
      let price = ''; // Microlink extrahiert standardmäßig keine Preise

      if (title.includes('Galaxus') || title.includes('digitec')) {
        title = title.split('- Galaxus')[0].split('| Galaxus')[0].split('- digitec')[0].trim();
      }

      return new Response(JSON.stringify({ title, image, description, price }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- NORMALER ABLAUF (Wenn direkter Fetch erfolgreich war) ---
    const getMeta = (regexList) => {
      for (const regex of regexList) {
        const match = html.match(regex);
        if (match && match[1]) return match[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
      }
      return '';
    };

    let title = getMeta([
      /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i,
      /<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ]);

    let image = getMeta([
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i,
      /<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i
    ]);

    let description = getMeta([
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i,
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i
    ]);

    let priceAmount = getMeta([
      /<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="product:price:amount"/i
    ]);
    let priceCurrency = getMeta([/<meta[^>]*property="product:price:currency"[^>]*content="([^"]+)"/i]);
    
    let price = '';
    if (priceAmount) {
      price = `${priceAmount} ${priceCurrency || 'CHF'}`;
    } else {
      const jsonLdPriceMatch = html.match(/"price"\s*:\s*"?(\d+[\.\,]\d{0,2})"?/i);
      if (jsonLdPriceMatch && jsonLdPriceMatch[1] && jsonLdPriceMatch[1] !== '0') {
        price = `CHF ${jsonLdPriceMatch[1]}`;
      } else {
        const chfMatch = html.match(/(?:CHF|Fr\.)\s*([1-9]\d*[\.\,]\d{2}|[1-9]\d*)/i);
        if (chfMatch) price = `CHF ${chfMatch[1]}`;
      }
    }

    if (title.includes('IKEA')) {
      title = title.split('-')[0].trim();
    }
    
    if (image && image.startsWith('//')) {
      image = 'https:' + image;
    } else if (image && image.startsWith('/')) {
      try {
        const urlObj = new URL(url);
        image = urlObj.origin + image;
      } catch(e) {}
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
