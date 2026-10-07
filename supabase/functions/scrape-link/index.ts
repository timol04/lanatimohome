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
    
    // 1. Direkter Fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
      }
    });
    
    if (response.ok) {
      html = await response.text();
    } else {
      console.log(`Direct fetch failed (${response.status}), trying corsproxy.io...`);
      // 2. Fallback: Corsproxy
      const corsRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
      if (corsRes.ok) {
        html = await corsRes.text();
      } else {
        console.log(`Corsproxy failed (${corsRes.status}), trying allorigins...`);
        // 3. Fallback: AllOrigins
        const allRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (allRes.ok) {
          const allJson = await allRes.json();
          html = allJson.contents || '';
        } else {
           console.log(`Allorigins failed, trying microlink...`);
           // 4. Fallback: Microlink
           const mlResponse = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
           if (mlResponse.ok) {
             const mlJson = await mlResponse.json();
             if (mlJson.status === 'success') microlinkData = mlJson.data;
           }
        }
      }
    }

    if (!html && !microlinkData) {
      throw new Error(`Alle Scraping-Versuche für diese URL (z.B. Galaxus) wurden durch Bot-Schutz blockiert.`);
    }

    // Regex-basiertes Auslesen der Meta-Tags
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
