# Conformité des rejets

Page : `frontend/src/pages/ConformiteRejets.tsx` — catégorie **4. Contrôle de
conformité**. Code : `frontend/src/lib/rejets/`.

Rejets d'une unité de traitement d'air ou d'eau (extraction des gaz du sol,
pompage-traitement) comparés aux valeurs limites générales de l'arrêté du
2 février 1998 modifié (`conformite.ts`).

## Air — article 27

- Seuils de flux horaire ; COV en carbone total ; sommes de l'annexe III.
- CMR et halogénés H341 / H351, métaux, cancérigènes de l'annexe IV.
- Oxydation (VLE selon le rendement).
- Conditions normales et oxygène de référence (article 24).

## Eau — articles 31, 32 et 34

pH, température, MES, DBO5, DCO, azote et phosphore, substances des 3° et
4°, raccordement à une station d'épuration.

## Résultats

- Lus dans le fichier du laboratoire (tous les onglets ; un échantillon par
  onglet admis, `grille.ts`) ou saisis à la main.
- Air : résultats en concentration repris tels quels, ou résultats par
  échantillon (µg/support, µg/tube) convertis avec la durée et le débit de
  prélèvement saisis par échantillon ; volume ramené aux conditions
  normales si la température et la pression sont données. Quand le
  laboratoire donne les deux, l'utilisateur choisit la base de
  l'évaluation.
- Unités converties vers celles de l'arrêté (`unites.ts` : mg/m³, mg C/m³,
  ppm → mg/m³, mg/l, nitrates et nitrites en azote).

## Évaluation

- Bilan échantillon par échantillon (entrée, intermédiaire, rejet).
- Résultats < LQ en bornes basse et haute : conforme si la borne haute
  respecte la VLE, non conforme si la borne basse la dépasse, indéterminé
  entre les deux.
- Tolérance de 10 % de l'autosurveillance permanente (article 21), sans
  jamais dépasser le double de la VLE.
- Rapport Excel (`export.ts`).
