/**
 * packPaths.ts
 * Shared getStaticPaths() for Astro dynamic routes.
 * Imports the taxonomy JSON and returns one path entry per pack.
 */
import type { GetStaticPathsResult } from 'astro';
import type { TaxonomyPack } from '../../types/game.ts';
import allPacks from '../../data/taxonomyPacks.json';

export function getStaticPaths(): GetStaticPathsResult {
  return (allPacks as TaxonomyPack[]).map((pack) => ({
    params: { slug: pack.slug },
    props: { pack },
  }));
}
