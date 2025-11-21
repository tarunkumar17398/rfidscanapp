export interface InventoryItem {
  'ITEM CODE': string;
  'PARTICULARS': string;
  'SIZE': string;
  'Weight': string;
  'RFID-EPC': string;
}

export interface APIResponse {
  success: boolean;
  count: number;
  data: InventoryItem[];
}

export const fetchInventoryFromAPI = async (): Promise<InventoryItem[]> => {
  console.log('=== FETCHING FROM CK INVENTORY API ===');
  const apiUrl = "https://eucxuuepfsrbgktlqyqx.supabase.co/functions/v1/rfid-export";
  
  try {
    console.log('Calling API (no pagination - fetching all at once)...');
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    const items = result.data || [];
    
    console.log(`✓ API Response:`, {
      totalItems: items.length,
      hasMoreIndicator: !!result.nextPage,
      count: result.count,
      allKeys: Object.keys(result)
    });
    
    console.log(`=== FETCH COMPLETE: ${items.length} total items ===`);
    
    return items;
  } catch (error) {
    console.error('❌ API Fetch Error:', error);
    throw error;
  }
};
