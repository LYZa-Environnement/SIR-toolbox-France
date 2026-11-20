# Lecture des chromatogrammes

Route : `/chromatogrammes` · code : `frontend/src/pages/Chromatogrammes.tsx`,
`frontend/src/lib/chromato/`, `frontend/src/components/chromato/`.

Tire d'un chromatogramme d'hydrocarbures C10–C40 (CG/DIF, NF EN ISO 16703
pour les sols, NF EN ISO 9377-2 pour les eaux) la nature probable du
produit, son origine, son état d'altération et un âge approché du
déversement. La démarche est celle du deuxième niveau du rapport
**BRGM/RP-64174-FR** (Colombano et al., 2014, « Nature des produits
pétroliers et origine du vieillissement ») : empreinte CG/DIF, coupe
pétrolière, état de dégradation, rapports n-C17/pristane, n-C18/phytane et
pristane/phytane.

## Entrées

- **Rapport PDF du laboratoire** : rendu dans le navigateur (pdf.js, environ
  2 400 px de large) ; les pages qui mentionnent un chromatogramme ou les
  repères C10 / C40 sont proposées.
- **Capture d'écran** (PNG, JPEG, ou Ctrl+V).
- **Trace numérique** (CSV ou texte : temps ; signal), avec les temps de
  rétention de C10 et C40.
- **Valeurs du laboratoire**, facultatives ou à la place du chromatogramme :
  indice C10–C40 et LQ, n-C17, pristane, n-C18, phytane, fractions
  carbonées, BTEX, alkyl-plomb, éthers (MTBE, ETBE, TAME), produit connu.
- Six **exemples fictifs** : gazole frais, biodégradé, très dégradé, huile,
  mélange gazole + huile, cires végétales.

## Numérisation (`lib/chromato/numerisation.ts`)

L'utilisateur cadre le graphique, clique sur les repères C10 et C40, et
vérifie que la trace relevée (en rouge) suit la courbe. La couleur de la
trace est celle qui occupe le plus de colonnes (les repères verticaux et
les légendes n'en occupent que quelques-unes) ; on peut aussi la choisir en
cliquant sur la courbe. Lignes de grille et repères verticaux sont écartés.

## Profil (`lib/chromato/profil.ts`)

- **Axe des carbones** : droite entre C10 et C40, puis recalage sur la série
  des n-alcanes (courbure du programme de four, puis pic par pic), retenu
  seulement si au moins cinq pics forment une série régulière.
- **Ligne de base** : enveloppe convexe inférieure de la trace.
- **Bosse non résolue (UCM)** : ouverture morphologique sur un carbone ; les
  hauteurs de pics sont lues au-dessus d'elle.
- **Pristane et phytane** : juste après n-C17 et n-C18 (indices de Kováts
  ≈ 1 707 et 1 811). En dessous de 33 points par carbone, les doublets sont
  déclarés non résolus : aucun rapport ni âge n'est calculé (vérifié sur des
  exemples numérisés : 30 points par carbone échouent, 39 réussissent). Les
  sommets peuvent être désignés à la main dans l'agrandissement C16–C19.
- **Distribution** : aire par carbone, quantiles, part de la bosse, maxima
  (mélanges), série de n-alcanes, CPI de Bray et Evans (C24–C34).

## Lecture (`lib/chromato/interpretation.ts`)

| Question | Indicateurs | Sources |
| --- | --- | --- |
| Nature du produit | plage et médiane des carbones, étendue, bosse, série de n-alcanes, comparées à sept produits types (`produits.ts`) | BRGM 2014 § 2.2.2 et 5.1 ; ITRC 2018 |
| Mélange | plusieurs maxima écartés d'au moins 5 carbones | BRGM 2014 § 5.1.1 |
| Origine | CPI (≥ 2 : cires végétales), pics isolés sans série (solvants, chlorés, HAP), bosse au-delà de C15 dans une eau (gel de silice) | BRGM 2014 § 5.5.1 ; Bray et Evans 1961 ; ITRC 2018 |
| Altération | n-C17/pristane rapporté à celui d'un gazole frais (2,1 à 2,5) : ≥ 80 %, 40–80 %, 10–40 %, < 10 % ; n-C17 absent ; seule la bosse ; perte des légers (début au-delà de C13) | BRGM 2014 § 2.3, 5.1.3, 5.5.2 ; Peters et Moldowan |
| Âge | T = −8,4 × (n-C17/Pr) + 19,8 ans (gazoles, sols ; ± 2 ans au calage, 3 à 10 ans ailleurs) ; Rb = (B+T)/(E+X) = 6,0 e^(−0,308 t) (essences, indicatif) ; alkyl-plomb → avant 2000 en France | Christensen et Larsen 1993 ; Hurst et Schmidt 2005 ; Kaplan et al. 1997 ; directive 98/70/CE |
| Suite | niveau 2 (n-alcanes, isoprénoïdes), niveau 3 (biomarqueurs, HAP alkylés, DBT), volatils et additifs, HPLC (colorant du fioul), gel de silice | BRGM 2014 § 6 |

Les seuils qui sont des conventions de l'outil, et non d'une source, le
disent dans le texte (« repère de l'outil ») : bandes des produits, seuils
de stade, CPI 1,3 et 2, indice < 5 × LQ, corrélations 0,95 / 0,85 / 0,6 et
tolérance de 20 % sur Pr/Ph pour la comparaison.

## Comparaison des échantillons

Chaque lecture peut être ajoutée à une comparaison : profils superposés,
tableau classé du plus au moins altéré (ancienneté relative pour un même
produit), et pour chaque paire l'une des quatre conclusions du BRGM
(§ 6.2) — correspondance, probable, indéterminée, pas de correspondance —
d'après la corrélation des profils et le rapport pristane/phytane. Export
CSV.

## Limites

La CG/DIF ne relie pas à coup sûr un échantillon à une source : produits de
même nature, mélanges avec un fond de pollution et fortes altérations
demandent la CG/SM (biomarqueurs, HAP alkylés) voire l'isotopie. Les âges
sont des ordres de grandeur, à croiser avec l'historique du site. Les
références marquées « source secondaire » dans l'outil sont à vérifier dans
l'original avant citation dans un rapport.

## Tests

`lib/chromato/*.test.ts` : équations (calculs à la main en commentaire),
recalage de l'axe, doublets, CPI, lecture des six exemples, saisie des
valeurs du labo, comparaison, extraction d'image, et un parcours complet
image dessinée → numérisation → lecture.
