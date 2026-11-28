/** How the model is built and what it cannot say. */
export default function MethodeLimites() {
  return (
    <details className="m3d-tableaux">
      <summary>Méthode et limites</summary>
      <ul>
        <li>
          <strong>Position et cotes</strong> : coordonnées des logs (Collars), sinon du suivi (Ouvrages), sinon saisies ; Lambert 93, coniques conformes CC42 à CC50 ou GPS
          reconnus et convertis en Lambert 93. Cote du sol du log, sinon du MNT IGN (RGE ALTI®) recalé sur les forages, sinon de la cote du repère de l’ouvrage.
        </li>
        <li>
          <strong>Formations</strong> : mots-clés des logs regroupés en formations ordonnées ; contact entre deux formations lu dans chaque forage, interpolé (krigeage des
          résidus d’une tendance plane, ou inverse distance), chaque formation entre son toit et son mur ; un forage qui n’atteint pas un contact contraint la surface à
          passer sous son fond. Limité aux parcelles du site quand le dossier les donne. Entre les forages, une lecture possible, pas une observation.
        </li>
        <li>
          <strong>Krigeage</strong> : tendance plane des moindres carrés, variogramme expérimental des résidus ajusté (pépite et modèle sphérique ou exponentiel), écart-type
          de krigeage (incertitude) et validation croisée (chaque point estimé sans lui). Sous six points, variogramme par défaut.
        </li>
        <li>
          <strong>Nappe</strong> : cote piézométrique mesurée, sinon cote du repère − profondeur de l’eau (fiches de prélèvement de Suivi temporel ou de Résultats labo
          comprises) ; sens d’écoulement et gradient du plan des ouvrages. Isopièzes tracées sur la surface krigée. Cours d’eau en option, comme cotes imposées approchées.
        </li>
        <li>
          <strong>Panache et évolution</strong> : champ krigé sur le logarithme des concentrations (la moitié de la LQ pour un résultat non quantifié), entre les
          ouvrages ; surface au-dessus de la valeur de comparaison et masse dissoute indicative à chaque campagne, tendance de Mann-Kendall. Tendances par ouvrage de Suivi
          temporel (MAROS, pente de Sen).
        </li>
        <li>
          <strong>Délimitation du panache</strong> : autour de chaque ouvrage au-dessus de la valeur de comparaison, quatre quadrants orientés sur l’écoulement, chacun
          fermé ou non par un ouvrage sous la valeur ; pourtour des ouvrages franchi par le champ interpolé ; probabilité de dépassement tirée du krigeage du logarithme
          (erreur gaussienne) ; emplacements proposés au-delà des fronts ouverts, puis là où le classement est le plus douteux, la variance de krigeage recalculée avec
          chaque ouvrage ajouté.
        </li>
        <li>
          <strong>Géologie et comportement des polluants</strong> (guides du BRGM : RP-74064-FR, 2024 ; Documents du BRGM 300, 2008) : aquifère des crépines des
          ouvrages analysés, ouvrages crépinés ailleurs écartés de la délimitation ; crépines contrôlées selon la densité du composé (jusqu’au mur pour un composé plus
          dense que l’eau, à cheval sur la nappe pour un plus léger) ; phase pure probable dès 1 % de la solubilité des COHV ; panache étiré dans le sens de
          l’écoulement (αT = αL / 10) et limité à l’aquifère ; vitesses de l’eau et du polluant (facteur de retard) avec une perméabilité mesurée ; crépine conseillée
          pour chaque emplacement.
        </li>
        <li>
          <strong>Sols</strong> : enveloppe au-dessus d’un seuil par inverse distance en trois dimensions ; filières d’après l’annexe II de l’arrêté du 12 décembre 2014
          et la décision 2003/33/CE, volumes par l’échantillon le plus proche. Ordres de grandeur, pas une cubature.
        </li>
        <li>
          <strong>Gaz du sol</strong> : concentrations de Résultats labo (volume prélevé saisi là-bas) rattachées aux forages du même nom, comparées à titre de repère à
          la valeur R1 de l’air intérieur.
        </li>
      </ul>
    </details>
  )
}
