/** In-memory hand-off of objects between screens (avoids refetching / huge route params). */
const ads = new Map<string, any>();
export const rememberAd = (ad: any) => { ads.set(ad.id, ad); return ad.id as string; };
export const cachedAd = (id: string) => ads.get(id);
