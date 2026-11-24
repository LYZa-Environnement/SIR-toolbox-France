# Réseaux et concessionnaires

Route : `/reseaux` · code : `frontend/src/pages/Reseaux.tsx`,
`frontend/src/lib/reseaux/`.

Catégorie **1. Contexte du site et préparation des investigations**.

Réunit sur une carte, autour d'un point, les tracés de réseaux publiés en
données ouvertes : électricité, éclairage public, gaz, hydrocarbures, eau
potable, assainissement, eaux pluviales, télécommunications (fibre), chaleur
et froid urbains. Sert à préparer l'implantation des sondages et la liste
des exploitants à consulter, puis à recouper leurs réponses.

> **Ne remplace pas la DT-DICT.** Les sondages, forages et fouilles d'une
> investigation sont des travaux au sens de la réglementation
> anti-endommagement (code de l'environnement, articles L. 554-1 à L. 554-5
> et R. 554-1 et suivants). La DT et la DICT auprès du
> [guichet unique](https://www.reseaux-et-canalisations.ineris.fr/) restent
> obligatoires ; seules les réponses des exploitants (avec leur classe de
> précision A, B ou C) font foi. Les données de l'outil sont indicatives et
> ne couvrent pas tous les réseaux.

## Utilisation

1. Saisir une adresse, choisir un rayon (50 à 500 m, 200 m par défaut).
2. « Déplacer le point » puis cliquer sur la carte pour un site sans adresse
   ou l'emplacement d'un sondage ; l'adresse la plus proche est retrouvée
   (géocodage inverse IGN) pour les informations communales.
3. Cocher ou décocher les familles de réseaux ; cliquer sur un objet pour ses
   attributs, sa distance au point et sa source.
4. Exporter les objets du rayon en **GeoJSON** (SIG, DAO) ou la synthèse en
   **CSV**.

## Restitution

- **Carte** : photo aérienne, carte IGN ou plan IGN ; couleurs du code des
  réseaux (NF P 98-332 : rouge électricité et éclairage, jaune gaz, orange
  hydrocarbures et produits chimiques, bleu eau potable, marron
  assainissement et eaux pluviales, vert télécommunications, violet chaleur) ;
  trait plein souterrain ou non précisé, tirets aérien.
- **Synthèse par réseau** : distance au point de l'objet le plus proche,
  linéaire de réseau dans le rayon (tronçons découpés au cercle), nombre
  d'objets, gestionnaires nommés par les données, objets par type.
- **Exploitants à consulter** : gestionnaires du rayon, du plus proche au plus
  éloigné, et distributeurs d'électricité et de gaz désignés pour la commune.
- **Fibre et chaleur** : réseau fibre de la commune et calendrier de fermeture
  du cuivre ; réseau de chaleur le plus proche.
- **Ce que la carte ne montre pas** : familles sans aucune source sur le
  secteur, et familles interrogées sans objet dans le rayon.
- **Sources interrogées** : résultat de chaque source, limite atteinte,
  licence, lien vers la fiche.

Chaque source est interrogée sur le carré qui contient le cercle (filtre
côté serveur), puis seuls les objets à moins du rayon sont retenus. Une
source est plafonnée à 2 000 objets (8 000 pour le PCRS de Bordeaux) ; au-delà
elle est signalée « limitée » et il faut réduire le rayon.

Distances et longueurs sont calculées dans un plan local équirectangulaire
centré sur le point (écart inférieur à 1 % sur quelques kilomètres),
`lib/reseaux/synthese.ts`.

## Sources nationales

| Source | Contenu | Accès |
| --- | --- | --- |
| [Agence ORE](https://opendata.agenceore.fr) | Lignes BT et HTA aériennes et souterraines, postes HTA/BT (transformateurs), canalisations de distribution de gaz, avec le gestionnaire (Enedis, ELD, GRDF, Régaz, etc.) | data-fair, `bbox` |
| Agence ORE | Distributeurs d'électricité et de gaz par commune | data-fair |
| [IGN, BD TOPO](https://geoservices.ign.fr/bdtopo) | Lignes haute tension (63 à 400 kV), postes électriques, grandes canalisations de transport | WFS Géoplateforme |
| [Géoportail de l'Urbanisme](https://www.geoportail-urbanisme.gouv.fr/) | Ouvrages générateurs de servitudes : A5 (eau, assainissement), I1/I3/I5 (gaz, hydrocarbures, produits chimiques), I4 (électricité), PT3 (télécommunications) | API Carto GPU |
| [ANCT, France Très Haut Débit](https://www.data.gouv.fr/datasets/indicateur-france-tres-haut-debit-etat-des-deploiements-de-la-fibre-optique-et-decommissionnement-du-cuivre) | Par commune : zonage fibre, porteur, exploitant et opérateur d'infrastructure, locaux raccordables, fermeture du cuivre | API tabulaire data.gouv.fr |
| [France Chaleur Urbaine](https://france-chaleur-urbaine.beta.gouv.fr/) | Réseau de chaleur le plus proche, gestionnaire, classement | API `eligibility` |

Les compteurs individuels ne sont pas publiés (données personnelles) ; les
postes HTA/BT sont les transformateurs de distribution.

## Sources locales

Interrogées seulement quand leur territoire recoupe la zone.

| Réseau | Territoires |
| --- | --- |
| Télécommunications (fibre) | Métropole de Lyon (réseau d'initiative publique), Côtes-d'Armor (artères et chambres de la montée en débit) |
| Eau potable | Lisieux Normandie (canalisations, exploitant) ; poteaux et bouches incendie de Rennes Métropole, Eurométropole de Strasbourg, Angers Loire Métropole |
| Assainissement | Hauts-de-Seine (réseau départemental), Rennes Métropole, Métropole européenne de Lille (annexe sanitaire du PLUi), Plaine Vallée |
| Eaux pluviales | Angers Loire Métropole (collecteurs, regards, avaloirs), Plaine Vallée, Pays Réuni d'Orange |
| Tous réseaux (affleurants) | Bordeaux Métropole : PCRS, chaque tampon, vanne ou coffret visible en surface, classé par réseau |
| Chaleur et froid | Lyon, Bordeaux, Rennes, Rouen, Tours, Poitiers |
| Éclairage public | Paris, Bordeaux, Nantes, Toulouse, Tours, Mulhouse, Issy-les-Moulineaux, Grand Poitiers, Brest, Cœur de France, Pays Réuni d'Orange, Vallée des Baux-Alpilles, Parc du Luberon |

Recensement de novembre 2026 : jeux de données de data.gouv.fr et
catalogues des portails Opendatasoft des métropoles, régions et
départements, puis essai de chaque service (requête par emprise, accès
depuis le navigateur). Les jeux publiés seulement en fichiers (shapefile,
CSV sans API, par exemple La Rochelle, Annecy) ou sur un serveur sans accès
depuis un autre site ne sont pas repris.

## Ce qui manque

- **Fibre et cuivre** : les tracés d'Orange, SFR, XpFibre, Free et des
  opérateurs de réseaux d'initiative publique ne sont pas publiés, hors les
  réseaux ouverts ci-dessus et les câbles grevés d'une servitude PT3.
  L'indicateur de l'ANCT nomme néanmoins l'exploitant du réseau fibre de
  chaque commune.
- **Eau potable et assainissement** : pas de base nationale ; seules quelques
  collectivités publient leurs plans, et les servitudes A5 ne concernent que
  les canalisations en terrain privé.
- **Réseau de transport d'électricité** : les tracés RTE ne sont plus publiés
  avec leur géométrie sur ODRÉ ; la BD TOPO en donne la position, sans le
  gestionnaire.

## Ajouter une source

Une entrée dans `SOURCES` (`lib/reseaux/sources.ts`) : protocole d'accès
(data-fair, Opendatasoft, WFS, OGC API Features, ArcGIS REST), emprise
(ouest, sud, est, nord), familles de réseaux, et une fonction `classer` qui
range chaque objet (famille, type d'objet, aérien ou non). Les tests de
`sources.test.ts` vérifient la cohérence du catalogue ; ceux de
`requetes.test.ts` les URL de chaque protocole.
