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
- **Fichier de résultats du laboratoire** (Excel ou CSV, lu par
  `lib/resultats/parse.ts`) : pour l'échantillon choisi, les 16 HAP, les BTEX,
  les indices C10–C40 et C5–C10, les fractions, et pristane / phytane s'ils y
  figurent (`lib/chromato/composes.ts`).
- **Saisie** facultative, ou à la place du chromatogramme : indice C10–C40 et
  LQ, BTEX, alkyl-plomb, éthers (MTBE, ETBE, TAME), 16 HAP, fractions,
  produit connu, et n-C17, pristane, n-C18, phytane (rarement proposés).
- Sept **exemples fictifs** : gazole frais, biodégradé, biodégradé avec
  étalons C10/C40, très dégradé, huile, mélange gazole + huile, cires
  végétales.

### Étalons C10 et C40

Beaucoup de laboratoires ajoutent du n-décane et du n-tétracontane à l'extrait
pour borner la fenêtre C10–C40. Avec l'option « étalons » (cochée par défaut) :

- leurs pics sont proposés comme repères C10 et C40 dès le cadrage (bouton
  « Caler sur les pics étalons »), ou dès le chargement d'une trace CSV. Les
  deux étalons sont ajoutés à la même concentration : n-C40 est le dernier
  pic haut et étroit, n-C10 le dernier du premier tiers de hauteur voisine
  (± 25 %), le front de solvant, souvent plus haut, venant avant lui ;
- après le calage, leurs pics (± 0,35 carbone) sont retirés du signal : ils
  ne comptent ni dans l'aire, ni dans la série de n-alcanes, ni dans les
  seuils et l'échelle du graphique.

## Numérisation (`lib/chromato/numerisation.ts`)

L'utilisateur cadre le graphique, clique sur les repères C10 et C40 (ou les
laisse proposer par les étalons), et vérifie que la trace relevée (en rouge)
suit la courbe et que le zéro (pointillé vert) est sur l'axe des abscisses.

L'axe des abscisses est la ligne horizontale la plus basse sous laquelle la
trace ne descend pas : il sert de zéro, et tout ce qui est en dessous
(graduations, étiquettes C10 / C40, titre) est ignoré. Une colonne vide au
bout du cadre ou entre deux points posés sur l'axe vaut zéro (la trace est
cachée par l'axe). Les pixels anticrénelés d'un trait fin comptent comme de
la trace. Seuls les repères verticaux en pointillé et l'axe des ordonnées
sont écartés : un trait vertical continu est un pic. La couleur de la
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
- **Distribution** : aire par carbone, quantiles, maxima (mélanges), série de
  n-alcanes, CPI de Bray et Evans (C24–C34), et la bosse elle-même (sommet,
  étendue à 90 %).
- **Émergence des n-alcanes** : hauteur des n-alcanes au-dessus de la bosse
  rapportée à la bosse sous eux (médiane). La part de la bosse dans l'aire
  dépasse souvent la moitié même pour un gazole frais (les pics, fins, pèsent
  peu en aire) : elle ne sert plus d'alerte. L'émergence suit ce que regarde
  l'analyste — au-dessus de 1, les pics dominent la bosse, condition de
  lecture posée par le BRGM (§ 6.2). Exemples : gazole frais 7,8, biodégradé
  1,2, très dégradé 0.

## Lecture (`lib/chromato/interpretation.ts`)

| Question | Indicateurs | Sources |
| --- | --- | --- |
| Nature du produit | plage et médiane des carbones, étendue, bosse, série de n-alcanes, comparées à sept produits types (`produits.ts`) | BRGM 2014 § 2.2.2 et 5.1 ; ITRC 2018 |
| Mélange | plusieurs maxima écartés d'au moins 5 carbones | BRGM 2014 § 5.1.1 |
| Origine | CPI (≥ 2 : cires végétales), pics isolés sans série (solvants, chlorés, HAP), bosse au-delà de C15 dans une eau (gel de silice) | BRGM 2014 § 5.5.1 ; Bray et Evans 1961 ; ITRC 2018 |
| Altération (isoprénoïdes) | n-C17/pristane rapporté à celui d'un gazole frais (2,1 à 2,5) : ≥ 80 %, 40–80 %, 10–40 %, < 10 % ; n-C17 absent | BRGM 2014 § 5.5.2 ; Peters et Moldowan |
| Altération (forme) | sans isoprénoïdes : émergence des n-alcanes ≥ 3, 1–3, < 1, plus de série, plus de pristane ; perte des légers (début au-delà de C13) ; position de la bosse | BRGM 2014 § 2.3, 5.1.3, 6.2 ; ITRC 2018 |
| Altération (HAP / BTEX) | séquence de disparition : BTEX quantifiés ou non, naphtalène / phénanthrène (≥ 1, 0,1–1, < 0,1), HAP 2–3 / 4–6 cycles (< 1) ; benzène majoritaire dans l'eau, benzène absent du sol, toluène < éthylbenzène avec E/X > 0,5 (anaérobie) | BRGM 2014 § 2.3, 5.2.2 ; Oudijk 2009 ; ITRC 2018 |
| Origine des HAP | 2–3 / 4–6 cycles, phénanthrène / anthracène (< 10 pyrolytique, > 25 pétrogénique), rapports d'isomères de Yunker | Wang et al. 1999 ; BRGM 2014 tabl. 25 ; Yunker et al. 2002 |
| Âge | T = −8,4 × (n-C17/Pr) + 19,8 ans (gazoles, sols ; ± 2 ans au calage, 3 à 10 ans ailleurs) ; Rb = (B+T)/(E+X) = 6,0 e^(−0,308 t) (essences, indicatif) ; alkyl-plomb → avant 2000 en France | Christensen et Larsen 1993 ; Hurst et Schmidt 2005 ; Kaplan et al. 1997 ; directive 98/70/CE |
| Suite | niveau 2 (n-alcanes, isoprénoïdes), niveau 3 (biomarqueurs, HAP alkylés, DBT), volatils et additifs, HPLC (colorant du fioul), gel de silice | BRGM 2014 § 6 |

Les seuils qui sont des conventions de l'outil, et non d'une source, le
disent dans le texte (« repère de l'outil ») : bandes des produits, seuils
de stade, CPI 1,3 et 2, indice < 5 × LQ, corrélations 0,95 / 0,85 / 0,6 et
tolérance de 20 % sur Pr/Ph pour la comparaison, émergence 3, seuils de la
séquence HAP / BTEX.

Sans pristane ni phytane (le cas courant), la séquence HAP / BTEX donne le
stade quand le chromatogramme ne le donne pas, et sert de seconde ligne de
preuve sinon. Elle n'a de sens que pour des HAP pétrogéniques : des HAP de
combustion reflètent leur source, non le vieillissement du produit.

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
