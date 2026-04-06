import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_CODES: Record<string, string> = {
  'BR': 'Brass',
  'IR': 'Iron',
  'WD': 'Wood',
  'TP': 'Tanjore Paintings',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch from CK Inventory API
    console.log('Fetching from CK Inventory API...');
    const apiResponse = await fetch('https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export');
    if (!apiResponse.ok) {
      throw new Error(`API error: ${apiResponse.status}`);
    }
    const result = await apiResponse.json();
    const items = result.data || [];
    console.log(`Received ${items.length} items from API`);

    if (items.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: 'No items from API' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Transform items
    const allInventoryData = [];
    const categoryCounts: Record<string, number> = {};

    for (const item of items) {
      const itemCode = item['ITEM CODE'];
      if (!itemCode || itemCode.length < 4) continue;

      const code = itemCode.substring(2, 4).toUpperCase();
      const category = CATEGORY_CODES[code];
      if (!category) continue;

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      const hasRfid = Boolean(item['RFID-EPC']?.trim());
      allInventoryData.push({
        category,
        item_code: itemCode,
        particulars: item['PARTICULARS'] || null,
        size: item['SIZE'] || null,
        weight: item['Weight'] || null,
        tag_id: hasRfid ? item['RFID-EPC'] : null,
        has_rfid_tag: hasRfid,
      });
    }

    console.log(`Prepared ${allInventoryData.length} items. Categories:`, categoryCounts);

    // Step 3: Upsert in batches (server-side = fast, no round trips)
    const BATCH_SIZE = 500;
    let totalUpserted = 0;

    for (let i = 0; i < allInventoryData.length; i += BATCH_SIZE) {
      const batch = allInventoryData.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('inventory')
        .upsert(batch, { onConflict: 'item_code' });

      if (error) {
        console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
        throw error;
      }
      totalUpserted += batch.length;
    }

    const itemsWithRfid = allInventoryData.filter(i => i.has_rfid_tag).length;

    console.log(`Sync complete: ${totalUpserted} items upserted`);

    return new Response(JSON.stringify({
      success: true,
      count: totalUpserted,
      withRfid: itemsWithRfid,
      withoutRfid: totalUpserted - itemsWithRfid,
      categories: categoryCounts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
