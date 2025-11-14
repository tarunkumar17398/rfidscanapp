import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScanResult {
  tagId: string;
  success: boolean;
  error?: string;
  duplicate?: boolean;
  itemCode?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tagIds } = await req.json();
    
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'tagIds must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing batch of ${tagIds.length} tags:`, tagIds);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Step 1: Get active cycle (cached for batch)
    const { data: cycles, error: cycleError } = await supabase
      .from('cycles')
      .select('id')
      .eq('status', 'active')
      .limit(1);

    if (cycleError) {
      console.error('Error fetching active cycle:', cycleError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch active cycle' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!cycles || cycles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active cycle found. Please start a cycle first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cycleId = cycles[0].id;
    console.log('Active cycle ID:', cycleId);

    // Step 2: Batch lookup all tags in inventory
    const { data: inventoryItems, error: inventoryError } = await supabase
      .from('inventory')
      .select('tag_id, item_code, category')
      .in('tag_id', tagIds);

    if (inventoryError) {
      console.error('Error fetching inventory:', inventoryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch inventory data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const inventoryMap = new Map(
      inventoryItems?.map(item => [item.tag_id, item]) || []
    );

    console.log(`Found ${inventoryItems?.length || 0} items in inventory`);

    // Step 3: Batch check which tags already scanned in this cycle
    const { data: existingScans, error: existingError } = await supabase
      .from('scans')
      .select('tag_id')
      .eq('cycle_id', cycleId)
      .in('tag_id', tagIds);

    if (existingError) {
      console.error('Error checking existing scans:', existingError);
      return new Response(
        JSON.stringify({ error: 'Failed to check existing scans' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const alreadyScannedSet = new Set(
      existingScans?.map(scan => scan.tag_id) || []
    );

    console.log(`${alreadyScannedSet.size} tags already scanned in this cycle`);

    // Step 4: Prepare results and new scans to insert
    const results: ScanResult[] = [];
    const scansToInsert = [];

    for (const tagId of tagIds) {
      // Check if tag exists in inventory
      const inventoryItem = inventoryMap.get(tagId);
      if (!inventoryItem) {
        results.push({
          tagId,
          success: false,
          error: 'Tag not found in inventory'
        });
        continue;
      }

      // Check if already scanned
      if (alreadyScannedSet.has(tagId)) {
        results.push({
          tagId,
          success: true,
          duplicate: true,
          itemCode: inventoryItem.item_code
        });
        continue;
      }

      // Prepare for insertion
      scansToInsert.push({
        tag_id: tagId,
        cycle_id: cycleId,
        category: inventoryItem.category,
        item_code: inventoryItem.item_code
      });

      results.push({
        tagId,
        success: true,
        duplicate: false,
        itemCode: inventoryItem.item_code
      });
    }

    // Step 5: Batch insert all new scans at once
    if (scansToInsert.length > 0) {
      console.log(`Inserting ${scansToInsert.length} new scans`);
      const { error: insertError } = await supabase
        .from('scans')
        .insert(scansToInsert);

      if (insertError) {
        console.error('Error inserting scans:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to insert scans' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('Batch insert successful');
    }

    console.log(`Batch complete: ${results.length} tags processed`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Batch scan error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
