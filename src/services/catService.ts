export interface CatImage {
  url: string;
  breeds?: {
    name: string;
    temperament: string;
  }[];
}

const CAT_API_KEY = 'live_y6EC8UAtPfBNhX3ktdqxsSYGpOPGNiLAE80i9aVr6ZQwKJZwmdM33nGDWTTtrriG';

export async function fetchRandomCat(): Promise<CatImage | null> {
  try {
    const res = await fetch('https://api.thecatapi.com/v1/images/search?has_breeds=1&limit=1', {
      headers: { 'x-api-key': CAT_API_KEY }
    });
    const data = await res.json();
    return data[0] || null;
  } catch (error) {
    console.error('Error fetching cat:', error);
    return null;
  }
}
