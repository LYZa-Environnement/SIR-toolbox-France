# Interprétation PFAS

Page : `frontend/src/pages/InterpretationPfas.tsx` — catégorie **3. Résultats
d'analyses et interprétation**. Code : `frontend/src/lib/pfas/`.

Lecture des résultats PFAS en eaux souterraines ou en sols, depuis le
fichier du laboratoire. Plusieurs fichiers peuvent être réunis, par exemple
le TFA rendu à part. Un exemple fictif est intégré.

## Substances reconnues

`lecture.ts`, `substances.ts` :

- les 20 PFAS de la directive (UE) 2020/2184, le TFA et le 6:2 FTS, reconnus
  par n° CAS, abréviation ou nom ;
- isomères linéaires et ramifiés ;
- AOF / EOF (fluor organique adsorbable / extractible).

Ouvrages classés dans l'ordre naturel (Pz1, Pz2, Pz10).

## Lectures

- **Somme des 20** du laboratoire comparée aux seuils (0,1 µg/l eau du
  robinet, 2 µg/l eaux brutes) et située sur des échelles logarithmiques
  avec les valeurs publiées (`reperes.ts` : ANSES, RIVM, Dauchy et al. 2019,
  Brusseau et al. 2020…).
- **Comparaison de tous les échantillons** : profils, indicateurs et pistes
  côte à côte, profil de l'ensemble.
- **Profil par longueur de chaîne.**
- **Indicateurs de composition**, lus d'après leur valeur, et **bilan du
  fluor** (`indicateurs.ts`) : fractions de fluor calculées d'après les
  formules (`substances.ts`).
- **Pistes de sources**, critère par critère (`sources.ts`), avec une
  explication des deux procédés de fabrication (électrochimique,
  télomérisation).
- **Contrôles** : somme du laboratoire, blancs.

## Références

Chaque valeur et chaque lecture renvoient à la bibliographie de
`references.ts` (39 références vérifiées, sources secondaires signalées).
