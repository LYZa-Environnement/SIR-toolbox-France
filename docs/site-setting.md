# Assistant Site Setting

Page : `frontend/src/pages/SiteSetting.tsx` — catégorie **1. Contexte du site
et plan d'investigation**.

## Ce que fait l'outil

1. Saisie d'une adresse (géocodage de la Géoplateforme IGN,
   `src/lib/geocode.ts`).
2. Délimitation du site par ses parcelles cadastrales
   (`src/components/SelecteurParcelles.tsx`, `src/lib/cadastre.ts`).
3. Cinq lectures cartographiées, une par rubrique (`src/themes/`) : qualité
   de l'eau, qualité de l'air (avec la rose des vents,
   `src/components/RoseDesVents.tsx`), qualité des sols, faune et flore,
   risques technologiques et naturels.

Chaque donnée est accompagnée de sa distance au site et de sa source.

## Sources interrogées en direct

Géorisques, Hub'Eau, IGN (Géoplateforme, API Carto), INPN, VigiEau,
Copernicus / CAMS, GIS Sol… Un client par source dans `src/lib/`
(`georisques.ts`, `hubeau.ts`, `nature.ts`, `vigieau.ts`, `airQualite.ts`,
`sols.ts`, `bruit.ts`, `reseauHydro.ts`…).

Deux jeux de données sont livrés avec le site, dans `frontend/public/data/` :

- `baignade.json` : sites de baignade, régénéré à chaque build par
  `scripts/baignade.mjs` (voir [Mise en ligne](../README.md#mise-en-ligne)) ;
- `ppe.geojson` : périmètres de protection éloignée des captages d'eau
  potable, France entière (14 179 périmètres, `src/lib/ppe.ts`), partagés
  avec la page Données environnementales publiques.
