
export interface NutritionData {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
}

export async function searchFoodDatabase(query: string): Promise<NutritionData[]> {
  try {
    // Using Open Food Facts Search API
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch from Open Food Facts');
    
    const data = await response.json();
    
    if (!data.products || data.products.length === 0) {
      return [];
    }

    return data.products.map((p: any) => ({
      name: p.product_name || 'Unknown Product',
      calories: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
      protein: Math.round(p.nutriments?.protein_100g || 0),
      carbs: Math.round(p.nutriments?.carbohydrates_100g || 0),
      fat: Math.round(p.nutriments?.fat_100g || 0),
      source: 'Open Food Facts'
    }));
  } catch (error) {
    console.error('Error searching food database:', error);
    return [];
  }
}

export async function getNutritionByBarcode(barcode: string): Promise<NutritionData | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch from Open Food Facts');
    
    const data = await response.json();
    if (data.status !== 1) return null;

    const p = data.product;
    return {
      name: p.product_name || 'Unknown Product',
      calories: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
      protein: Math.round(p.nutriments?.protein_100g || 0),
      carbs: Math.round(p.nutriments?.carbohydrates_100g || 0),
      fat: Math.round(p.nutriments?.fat_100g || 0),
      source: 'Open Food Facts'
    };
  } catch (error) {
    console.error('Error fetching by barcode:', error);
    return null;
  }
}
