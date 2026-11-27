# Dossiers d'étude

Code : `frontend/src/lib/dossier/` (format, accès au disque, dossier ouvert,
enregistrement d'un outil), `frontend/src/components/dossier/` (bandeau,
résumé sur l'accueil), `frontend/src/dossier-autonome.ts` (pages autonomes).

Un dossier d'étude est un **vrai dossier sur le disque**, typiquement dans un
dossier OneDrive partagé avec les collègues. Chaque outil utilisé y enregistre
son travail au fil de l'eau ; le dossier se rouvre plus tard, sur le même
poste ou sur celui d'un collègue, et chaque outil reprend où il en était.

**Edge ou Chrome uniquement** : la page lit et écrit dans le dossier choisi par
l'utilisateur (API File System Access, absente de Firefox et Safari). Rien
n'est envoyé à un serveur : le partage passe par la synchronisation OneDrive.

## Utilisation

- Le bandeau **Dossier**, sous l'en-tête (en encart en bas à droite sur les
  pages autonomes), donne le dossier ouvert, l'état de l'enregistrement de
  l'outil affiché, et un menu : nouveau dossier, ouvrir un dossier, dossiers
  récents, fermer.
- **Nouveau dossier** : n° d'affaire et nom, puis choisir où le ranger (par
  exemple « OneDrive - ERM › Études ») ; un sous-dossier « n° nom » y est
  créé. Un dossier vide choisi est utilisé tel quel. Le navigateur refuse les
  dossiers Documents, Bureau et Téléchargements eux-mêmes (pas leurs
  sous-dossiers).
- **Ouvrir un dossier** : choisir le dossier ; un dossier sans `dossier.json`
  peut devenir un dossier d'étude, ses fichiers restent en place.
- **Dossiers récents** : ceux ouverts sur ce poste. Après un redémarrage du
  navigateur, il redemande l'accès d'un clic (sauf « Autoriser à chaque
  visite »).
- **Votre nom ou vos initiales** : demandé une fois par poste, inscrit à chaque
  enregistrement pour que les collègues sachent qui a modifié quoi.
- L'accueil résume le dossier ouvert : site, outils utilisés, qui les a
  modifiés et quand. Chaque carte d'outil déjà utilisé porte « Dans le
  dossier ».

## Contenu du dossier

```
0712345 Usine X — Lyon/
  dossier.json            fiche : nom, n° d'affaire, site, création, dernière modification de chaque outil
  reseaux.json            un fichier par outil utilisé
  maillage.json
  points.json             points d'investigation : fichiers lus, systèmes choisis, points repris par les outils
  logs-forage.json
  resultats-labo.json
  suivi-temporel.json
  interpretation-pfas.json
  chromatogrammes.json
  conformite-rejets.json
  verification-livrables.json
  sources/                fichiers déposés dans les outils, copiés tels quels
  exports/                classeurs, CSV, figures produits par les outils
```

- **Un fichier par outil** : deux personnes sur deux outils différents ne se
  gênent jamais.
- **Le site** est saisi une fois, dans l'Assistant Site Setting, et repris
  par Réseaux (point de recherche), Création maillage (parcelles, quand le
  maillage est vide) et Données environnementales (carte centrée, emprise
  dessinée).
- **Les points d'investigation** se chargent une fois, depuis le résumé du
  dossier (accueil) ou le bandeau (« Points d'investigation ») : voir
  [points-investigation.md](points-investigation.md). Ils sont repris par
  Réseaux (points sur la carte, réseau le plus proche de chacun), Suivi
  temporel (coordonnées et cote du repère des ouvrages) et Logs de forage
  (coordonnées et cote du terrain naturel), rapprochés par le nom (« PZ01 » =
  « Pz1 »). Un outil lit les points avec `usePointsDossier()` ; une page
  autonome avec `SirDossier.points()` et `SirDossier.indexerPoints()`.
- **sources/** : tout fichier choisi ou déposé dans une page pendant qu'un
  dossier est ouvert. Le même fichier déposé deux fois n'est copié qu'une
  fois ; un autre fichier de même nom est numéroté (« rapport (2).xlsx »).
- **exports/** : chaque téléchargement produit par un outil React y est aussi
  copié ; le même export refait remplace le précédent.
- Les fichiers sont du JSON lisible ; chacun porte un numéro de format (un
  dossier enregistré aujourd'hui s'ouvre avec les versions suivantes) et un
  numéro de révision.

## Enregistrement et travail à plusieurs

- Chaque modification est enregistrée une à deux secondes après. Rien n'est
  écrit quand l'état n'a pas changé : ouvrir un dossier ou un outil sans rien
  modifier n'écrit rien. Un outil vide ne crée pas de fichier.
- Avant d'écrire, l'outil vérifie que personne n'a enregistré le fichier
  depuis son ouverture. Si un collègue l'a fait, **rien n'est écrasé** : le
  bandeau propose « Prendre sa version » ou « Garder la mienne ».
- Toutes les 20 s et au retour sur l'onglet, l'outil regarde si une version
  plus récente est arrivée (synchronisation OneDrive) et propose de
  l'afficher.
- Un outil modifié par un collègue dans le quart d'heure écoulé est signalé :
  ce n'est pas de l'édition simultanée comme dans Word en ligne, la
  synchronisation OneDrive prend de quelques secondes à quelques minutes.
- Ouvrir un dossier alors que l'outil affiche déjà un autre travail : le
  bandeau demande lequel garder.
- Quitter la page avec une modification pas encore écrite : le navigateur
  demande confirmation.

## Ajouter un outil

Un outil React :

```tsx
const sauve = useMemo(() => ({ fichiers, reglages }), [fichiers, reglages])
useSynchroDossier({
  outil: 'mon-outil',          // nom du fichier : mon-outil.json (ne plus le changer)
  version: 1,                  // à incrémenter si la forme des données change, avec `migrer`
  etat: sauve,                 // mémoïsé : chaque nouvelle valeur est une modification
  estVide: fichiers.length === 0,
  appliquer: (d) => { setFichiers(d.fichiers); setReglages(d.reglages) },
})
```

puis une entrée dans `OUTILS_DOSSIER` (`lib/dossier/outils.ts`). Les dates,
`Set`, `Map`, tableaux typés et NaN sont conservés tels quels. N'enregistrer
que ce que l'utilisateur a saisi ou chargé, pas ce qui se recalcule, ni
l'état d'affichage (volets ouverts).

Une page autonome : `<script type="module" src="dossier.js"></script>` en fin
de page, puis `SirDossier.bandeau()` et `SirDossier.synchroniser({ outil,
version, lire, appliquer, estVide })`, dont on appelle `signaler()` à chaque
modification (voir `creation-maillage.html` et `logs-forage.html`).

## Limites

- Un dossier n'est pas verrouillé : deux personnes sur le même outil au même
  moment verront des conflits, sans perte (le choix leur revient).
- Chromatogrammes : l'image numérisée est conservée (PNG), mais pas le PDF
  d'origine ; pour changer de page, redéposer le PDF (il est dans `sources/`).
- Données environnementales publiques n'enregistre rien (exploration de
  données publiques) ; elle part du site du dossier.
- Si la configuration du poste interdit l'écriture sur le disque aux sites
  web (stratégie Edge/Chrome), l'ouverture d'un dossier échoue avec un
  message l'indiquant : à voir avec le service informatique.
